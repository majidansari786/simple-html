const randnum = (min, max) => Math.round(Math.random() * (max - min) + min);

document.addEventListener('DOMContentLoaded', () => {
  const startScreen = document.getElementById('start-screen');
  const enterButton = document.getElementById('enter-game');
  const playerNameInput = document.getElementById('player-name');
  const gameModeSelect = document.getElementById('game-mode');
  const muteSoundCheckbox = document.getElementById('mute-sound');
  const hud = document.getElementById('hud');
  const leaderboardDiv = document.getElementById('leaderboard');
  const info = document.getElementById('info'); // For coordinates
  let playerName = '';
  let isMuted = false;
  let gameMode = 'deathmatch';

  console.log('Script loaded');

  enterButton.addEventListener('click', () => {
    playerName = playerNameInput.value.trim() || 'Player' + Math.floor(Math.random() * 1000);
    gameMode = gameModeSelect.value;
    isMuted = muteSoundCheckbox.checked;
    console.log('Entering game with name:', playerName, 'mode:', gameMode, 'muted:', isMuted);
    startScreen.style.display = 'none';
    const canvas = document.querySelector('canvas');
    if (!canvas) {
      console.error('Canvas element not found in the DOM');
      return;
    }
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    hud.style.display = 'block';
    startGame();
  });

  function startGame() {
    console.log('startGame called');

    if (!window.THREE) {
      console.error('Three.js not loaded');
      return;
    }

    if (!THREE.WEBGL.isWebGLAvailable()) {
      const warning = THREE.WEBGL.getWebGLErrorMessage();
      document.body.appendChild(warning);
      console.error('WebGL is not supported on this device');
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100000);
    camera.position.set(1, 0.75, -1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    console.log('Renderer initialized', renderer.domElement);

    const helper = new CannonHelper(scene);
    helper.addLights(renderer);

    const world = new CANNON.World();
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.gravity.set(0, -10, 0);
    world.defaultContactMaterial.friction = 0;

    const groundMaterial = new CANNON.Material('groundMaterial');
    const wheelMaterial = new CANNON.Material('wheelMaterial');
    const wheelGroundContactMaterial = new CANNON.ContactMaterial(wheelMaterial, groundMaterial, {
      friction: 0,
      restitution: 0,
      contactEquationStiffness: 1000
    });
    world.addContactMaterial(wheelGroundContactMaterial);

    // Lighting
    var light = new THREE.DirectionalLight(0xefefff, 1);
    light.position.set(1, 0, 1).normalize();
    scene.add(light);
    var light2 = new THREE.DirectionalLight(0xffefef, 1);
    light2.position.set(-1, 0, -1).normalize();
    scene.add(light2);
    var light3 = new THREE.DirectionalLight(0xdddddd);
    light3.position.set(3, 10, 4);
    scene.add(light3);

    // Terrain (simplified for now)
    const sizeX = 128, sizeY = 128, minHeight = 0, maxHeight = 60;
    const terrainBodies = [];
    const startPosition = new CANNON.Vec3(0, maxHeight - 3, sizeY * 0.5 - 10);

    function img2matrixFromUrl(url, width, depth, minHeight, maxHeight) {
      return new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = width;
          canvas.height = depth;
          ctx.drawImage(image, 0, 0, width, depth);
          const imgData = ctx.getImageData(0, 0, width, depth).data;
          const matrix = [];
          for (let i = 0; i < depth; i++) {
            matrix.push([]);
            for (let j = 0; j < width; j++) {
              const pixel = i * depth + j;
              const heightData = (imgData[pixel * 4] / 255) * (maxHeight - minHeight) + minHeight;
              matrix[i].push(heightData);
            }
          }
          resolve(matrix);
        };
        image.src = url;
      });
    }

    img2matrixFromUrl('https://raw.githubusercontent.com/Data-Bee38/images/main/terrain3.png', sizeX, sizeY, minHeight, maxHeight).then((matrix) => {
      const terrainShape = new CANNON.Heightfield(matrix, { elementSize: 10 });
      const terrainBody = new CANNON.Body({ mass: 0 });
      terrainBody.addShape(terrainShape);
      terrainBody.position.set((-sizeX * terrainShape.elementSize) / 2, -10, (sizeY * terrainShape.elementSize) / 2);
      terrainBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
      world.add(terrainBody);
      helper.addVisual(terrainBody, 'landscape');
      terrainBodies.push(terrainBody);

      // Car Setup
      const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.5, 1.75));
      const chassisBody = new CANNON.Body({ mass: 150, material: groundMaterial });
      chassisBody.addShape(chassisShape);
      chassisBody.position.set(flagLocation.position.x + 10, flagLocation.position.y + 5, flagLocation.position.z);
      helper.addVisual(chassisBody, 'car');

      var light2 = new THREE.DirectionalLight(new THREE.Color('white'), 0.1);
      light2.position.set(-1, 1, -1);
      light2.castShadow = true;
      light2.target = chassisBody.threemesh;
      chassisBody.threemesh.add(light2);

      const loader = new THREE.GLTFLoader();
      loader.load('https://raw.githubusercontent.com/Data-Bee38/models/main/challenger2_body.glb', (gltf) => {
        gltf.scene.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            node.material.side = THREE.DoubleSide;
            if (node.name === 'window') {
              node.material.color.set(new THREE.Color('black'));
              node.material.transparent = true;
              node.material.opacity = 0.5;
            }
          }
        });
        const model = gltf.scene;
        model.scale.set(1, 1, 1);
        chassisBody.threemesh.add(model);
      });

      const options = {
        radius: 0.25,
        directionLocal: new CANNON.Vec3(0, -1.1, 0),
        suspensionStiffness: 30,
        suspensionRestLength: 0.3,
        frictionSlip: 10,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        maxSuspensionForce: 100000,
        rollInfluence: 0.01,
        axleLocal: new CANNON.Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 0),
        maxSuspensionTravel: 0.3,
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true
      };

      const vehicle = new CANNON.RaycastVehicle({ chassisBody, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
      const axlewidth = 0.5;
      const backwheel = -0.85;
      const frontwheel = 1.05;
      const wheelheight = -0.1;
      options.chassisConnectionPointLocal.set(axlewidth, wheelheight, backwheel);
      vehicle.addWheel(options);
      options.chassisConnectionPointLocal.set(-axlewidth, wheelheight, backwheel);
      vehicle.addWheel(options);
      options.chassisConnectionPointLocal.set(axlewidth, wheelheight, frontwheel);
      vehicle.addWheel(options);
      options.chassisConnectionPointLocal.set(-axlewidth, wheelheight, frontwheel);
      vehicle.addWheel(options);
      vehicle.addToWorld(world);

      const wheelBodies = [];
      vehicle.wheelInfos.forEach((wheel) => {
        const cylinderShape = new CANNON.Cylinder(wheel.radius, wheel.radius, wheel.radius / 2, 20);
        const wheelBody = new CANNON.Body({ mass: 1, material: wheelMaterial });
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
        wheelBody.addShape(cylinderShape, new CANNON.Vec3(), q);
        wheelBodies.push(wheelBody);
        helper.addVisual(wheelBody, 'wheel');
      });

      loader.load('https://raw.githubusercontent.com/Data-Bee38/models/main/challenger2_wheel.glb', (gltf) => {
        gltf.scene.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            node.material.side = THREE.DoubleSide;
          }
        });
        const models = gltf.scene;
        wheelBodies.forEach((wheelBody, i) => {
          const model = models.clone();
          model.scale.set(1, 1, 1);
          if (i === 1 || i === 3) model.rotateY(Math.PI);
          wheelBody.threemesh.add(model);
        });
      });

      world.addEventListener('postStep', () => {
        for (let i = 0; i < vehicle.wheelInfos.length; i++) {
          vehicle.updateWheelTransform(i);
          const t = vehicle.wheelInfos[i].worldTransform;
          wheelBodies[i].threemesh.position.copy(t.position);
          wheelBodies[i].threemesh.quaternion.copy(t.quaternion);
        }
        const upVector = new CANNON.Vec3(0, 1, 0);
        const vehicleUp = new CANNON.Vec3();
        chassisBody.quaternion.vmult(upVector, vehicleUp);
        if (vehicleUp.y < 0.05) {
          chassisBody.position.set(flagLocation.position.x + 10, flagLocation.position.y + 5, flagLocation.position.z);
          chassisBody.velocity.set(0, 0, 0);
          chassisBody.angularVelocity.set(0, 0, 0);
          chassisBody.quaternion.set(0, 0, 0, 1);
        }
      });

      // Joystick and Controls
      class JoyStick {
        constructor(options) {
          const circle = document.createElement('div');
          circle.style.cssText = 'position:absolute; bottom:35px; width:80px; height:80px; background:rgba(126, 126, 126, 0.5); border:#444 solid medium; border-radius:50%; left:50%; transform:translateX(-50%);';
          const thumb = document.createElement('div');
          thumb.style.cssText = 'position: absolute; left: 20px; top: 20px; width: 40px; height: 40px; border-radius: 50%; background: #fff;';
          circle.appendChild(thumb);
          document.body.appendChild(circle);
          this.domElement = thumb;
          this.maxRadius = options.maxRadius || 40;
          this.maxRadiusSquared = this.maxRadius * this.maxRadius;
          this.onMove = options.onMove;
          this.game = options.game;
          this.origin = { left: this.domElement.offsetLeft, top: this.domElement.offsetTop };
          if (this.domElement) {
            this.domElement.addEventListener('touchstart', (evt) => this.tap(evt));
            this.domElement.addEventListener('mousedown', (evt) => this.tap(evt));
          }
        }
        getMousePosition(evt) { return { x: evt.targetTouches ? evt.targetTouches[0].pageX : evt.clientX, y: evt.targetTouches ? evt.targetTouches[0].pageY : evt.clientY }; }
        tap(evt) {
          this.offset = this.getMousePosition(evt);
          document.ontouchmove = (evt) => this.move(evt);
          document.ontouchend = (evt) => this.up(evt);
          document.onmousemove = (evt) => this.move(evt);
          document.onmouseup = (evt) => this.up(evt);
        }
        move(evt) {
          const mouse = this.getMousePosition(evt);
          let left = mouse.x - this.offset.x;
          let top = mouse.y - this.offset.y;
          const sqMag = left * left + top * top;
          if (sqMag > this.maxRadiusSquared) {
            const magnitude = Math.sqrt(sqMag);
            left /= magnitude; top /= magnitude;
            left *= this.maxRadius; top *= this.maxRadius;
          }
          this.domElement.style.top = `${top + this.domElement.clientHeight / 2}px`;
          this.domElement.style.left = `${left + this.domElement.clientWidth / 2}px`;
          const forward = -(top - this.origin.top + this.domElement.clientHeight / 2) / this.maxRadius;
          const turn = (left - this.origin.left + this.domElement.clientWidth / 2) / this.maxRadius;
          if (this.onMove) this.onMove.call(this.game, forward, turn);
        }
        up(evt) {
          document.ontouchmove = document.ontouchend = document.onmousemove = document.onmouseup = null;
          this.domElement.style.top = `${this.origin.top}px`;
          this.domElement.style.left = `${this.origin.left}px`;
          if (this.onMove) this.onMove.call(this.game, 0, 0);
        }
      }

      const js = { forward: 0, turn: 0 };
      const joystick = new JoyStick({ onMove: (forward, turn) => { js.forward = forward; js.turn = -turn; } });

      function updateDrive(forward = js.forward, turn = js.turn) {
        if (document.getElementById('myCheck').checked) {
          const maxSteerVal = 0.6;
          const maxForce = 250;
          const brakeForce = 10;
          const force = maxForce * -forward;
          const steer = maxSteerVal * turn;
          if (forward !== 0) {
            vehicle.setBrake(0, 0); vehicle.setBrake(0, 1); vehicle.setBrake(0, 2); vehicle.setBrake(0, 3);
            vehicle.applyEngineForce(force, 0); vehicle.applyEngineForce(force, 1);
          } else {
            vehicle.setBrake(brakeForce, 0); vehicle.setBrake(brakeForce, 1); vehicle.setBrake(brakeForce, 2); vehicle.setBrake(brakeForce, 3);
          }
          vehicle.setSteeringValue(steer, 2); vehicle.setSteeringValue(steer, 3);
        }
      }

      function animate() {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();
        world.step(1 / 60, delta);
        helper.updateBodies(world);
        updateDrive();
        renderer.render(scene, camera);
        info.innerHTML = `<span>X: </span>${chassisBody.threemesh.position.x.toFixed(2)}, <span>Y: </span>${chassisBody.threemesh.position.y.toFixed(2)}, <span>Z: </span>${chassisBody.threemesh.position.z.toFixed(2)}`;
      }
      animate();

      window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      });
    });

    const flagLocation = new THREE.Mesh(new THREE.BoxBufferGeometry(0.15, 2, 0.15).applyMatrix(new THREE.Matrix4().makeTranslation(0, 1, 0)), new THREE.MeshNormalMaterial({ transparent: true, opacity: 1 }));
    flagLocation.position.set(10, 0, 50);
    flagLocation.rotateY(Math.PI);
    scene.add(flagLocation);
    const pointflagLight = new THREE.PointLight(new THREE.Color('red'), 1.5, 5);
    pointflagLight.position.set(0, 3, 0);
    flagLocation.add(pointflagLight);
    const flagLight = new THREE.DirectionalLight(new THREE.Color('white'), 0);
    flagLight.castShadow = true;
    flagLight.target = flagLocation;
    scene.add(flagLight);
  }

  let health = 100;
  let score = 0;
});
