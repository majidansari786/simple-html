document.addEventListener('DOMContentLoaded', () => {
  const startScreen = document.getElementById('start-screen');
  const enterButton = document.getElementById('enter-game');
  const playerNameInput = document.getElementById('player-name');
  const gameModeSelect = document.getElementById('game-mode');
  const muteSoundCheckbox = document.getElementById('mute-sound');
  const hud = document.getElementById('hud');
  const leaderboardDiv = document.getElementById('leaderboard');
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
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    hud.style.display = 'block';
    startGame(canvas);
  });

  function startGame(canvas) {
    console.log('startGame called');

    if (!window.THREE) {
      console.error('Three.js not loaded');
      return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    console.log('Renderer initialized', renderer.domElement);

    if (!window.io) {
      console.error('Socket.IO not loaded. Check server configuration.');
      return;
    }
    const socket = io();
    console.log('Socket.IO connected:', socket.connected);

    let players = {};
    const playerCars = {};

    const world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);

    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(groundBody);

    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x808080 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const chassisShape = new CANNON.Box(new CANNON.Vec3(2, 0.5, 1));
    const chassisBody = new CANNON.Body({ mass: 75 }); // Increased mass for stability
    chassisBody.addShape(chassisShape);
    chassisBody.position.set(0, 2, 0);

    const vehicle = new CANNON.RaycastVehicle({ chassisBody });
    const wheelOptions = {
      radius: 0.5,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 50, // Increased for better stability
      suspensionRestLength: 0.3,
      frictionSlip: 10, // Increased for better grip
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      maxSuspensionForce: 150000, // Increased for stability
      rollInfluence: 0.01,
      axleLocal: new CANNON.Vec3(1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(),
      maxSuspensionTravel: 0.3,
    };
    const wheelPositions = [
      new CANNON.Vec3(-1.5, -0.5, 1),  // Front-left
      new CANNON.Vec3(-1.5, -0.5, -1), // Front-right
      new CANNON.Vec3(1.5, -0.5, 1),   // Rear-left
      new CANNON.Vec3(1.5, -0.5, -1),  // Rear-right
    ];
    wheelPositions.forEach(pos => vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: pos }));
    vehicle.addToWorld(world);

    function createCar() {
      const carGroup = new THREE.Group();
      const bodyGeometry = new THREE.BoxGeometry(4, 1, 2);
      const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      carGroup.add(body);

      const cabinGeometry = new THREE.BoxGeometry(2, 0.8, 1.8);
      const cabinMaterial = new THREE.MeshPhongMaterial({ color: 0xaaaaaa });
      const cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
      cabin.position.set(0, 0.8, 0);
      carGroup.add(cabin);

      const wheelGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 32); // Slightly taller for better visibility
      const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
      const wheels = [];
      wheelPositions.forEach((pos) => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.position.copy(pos); // Match physics positions exactly
        wheel.rotation.z = Math.PI / 2;
        wheel.castShadow = true; // Optional: Add shadows for better visualization
        carGroup.add(wheel);
        wheels.push(wheel);
      });

      return { car: carGroup, wheels };
    }

    let carData = createCar();
    let car = carData.car;
    let carWheels = carData.wheels;
    scene.add(car);
    let nameSprite = createTextSprite(playerName);
    nameSprite.position.set(0, 2, 0);
    car.add(nameSprite);

    const playerNameSprites = {};

    socket.on('updatePlayers', (serverPlayers) => {
      players = serverPlayers;
      for (let id in players) {
        if (id === socket.id) {
          health = players[id].health;
          score = players[id].score;
          continue;
        }
        if (!playerCars[id]) {
          playerCars[id] = createCar().car;
          playerCars[id].traverse((child) => {
            if (child.isMesh) child.material = new THREE.MeshPhongMaterial({ color: 0x0000ff });
          });
          scene.add(playerCars[id]);
          playerNameSprites[id] = createTextSprite(players[id].name);
          playerNameSprites[id].position.set(0, 2, 0);
          playerCars[id].add(playerNameSprites[id]);
        }
        if (playerCars[id]) {
          playerCars[id].position.set(players[id].x, players[id].y, players[id].z);
          playerCars[id].quaternion.set(players[id].qx, players[id].qy, players[id].qz, players[id].qw);
        }
      }
      for (let id in playerCars) {
        if (!players[id]) {
          scene.remove(playerCars[id]);
          delete playerCars[id];
          delete playerNameSprites[id];
        }
      }
      hud.textContent = isDestroyed ? `Score: ${score} - Health: ${health} - Destroyed! Press R to Restart` : `Score: ${score} - Health: ${health}`;
    });

    socket.on('updateLeaderboard', (leaderboard) => {
      leaderboardDiv.innerHTML = 'Leaderboard:<br>' + leaderboard.map((entry, i) => `${i + 1}. ${entry.name}: ${entry.score}`).join('<br>');
      if (isDestroyed) leaderboardDiv.style.display = 'block';
    });

    socket.on('destroyed', () => {
      isDestroyed = true;
      createExplosion(car.position);
      scene.remove(car);
      world.removeBody(chassisBody);
      vehicle.removeFromWorld(world);
      hud.textContent = `Score: ${score} - Health: ${health} - Destroyed! Press R to Restart`;
      leaderboardDiv.style.display = 'block';
    });

    const roadGeometry = new THREE.PlaneGeometry(20, 200);
    const roadMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, 0);
    scene.add(road);

    function addBuilding(x, z, width, height, depth) {
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshPhongMaterial({ color: 0x404040 });
      const building = new THREE.Mesh(geometry, material);
      building.position.set(x, height / 2, z);
      scene.add(building);
      const buildingBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)),
        position: new CANNON.Vec3(x, height / 2, z),
      });
      world.addBody(buildingBody);
    }
    addBuilding(30, 30, 10, 20, 10);

    const collectibles = [];
    function addCollectible(x, z) {
      const geometry = new THREE.SphereGeometry(0.5, 32, 32);
      const material = new THREE.MeshPhongMaterial({ color: 0xffff00 });
      const collectible = new THREE.Mesh(geometry, material);
      collectible.position.set(x, 0.5, z);
      scene.add(collectible);
      const body = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Sphere(0.5),
        position: new CANNON.Vec3(x, 0.5, z),
      });
      body.isCollectible = true;
      world.addBody(body);
      collectibles.push({ mesh: collectible, body: body });
    }
    addCollectible(5, 5);
    addCollectible(-5, -5);
    addCollectible(0, 10);

    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 20, 5);
    scene.add(directionalLight);

    const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false };
    document.addEventListener('keydown', (e) => {
      keys[e.key] = true;
      if (e.key === 'Space' && car && !isDestroyed && gameMode === 'deathmatch') shootBullet(car, chassisBody);
      if (e.key === 'r' || e.key === 'R') respawn();
    });
    document.addEventListener('keyup', (e) => keys[e.key] = false);

    const maxForce = 1500;
    const maxSteerVal = Math.PI / 8;
    function updateVehicle() {
      const frontWheels = [0, 1];
      const rearWheels = [2, 3];

      if (keys.ArrowUp) {
        rearWheels.forEach(i => vehicle.applyEngineForce(-maxForce, i));
      } else if (keys.ArrowDown) {
        rearWheels.forEach(i => vehicle.applyEngineForce(maxForce, i));
      } else {
        rearWheels.forEach(i => vehicle.applyEngineForce(0, i));
      }

      if (keys.ArrowLeft) {
        frontWheels.forEach(i => vehicle.setSteeringValue(maxSteerVal, i));
      } else if (keys.ArrowRight) {
        frontWheels.forEach(i => vehicle.setSteeringValue(-maxSteerVal, i));
      } else {
        frontWheels.forEach(i => vehicle.setSteeringValue(0, i));
      }
    }

    let score = 0;
    let health = 100;
    let isDestroyed = false;
    const bullets = [];
    let lastShotTime = 0;
    const shootCooldown = 500;
    let scoreToWin = gameMode === 'race' ? 10 : Infinity;

    function shootBullet(car, chassisBody) {
      const currentTime = Date.now();
      if (currentTime - lastShotTime < shootCooldown) return;
      lastShotTime = currentTime;

      const bulletGeometry = new THREE.SphereGeometry(0.2, 16, 16);
      const bulletMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
      const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
      bullet.position.copy(car.position);
      scene.add(bullet);

      const bulletBody = new CANNON.Body({
        mass: 0.1,
        shape: new CANNON.Sphere(0.2),
      });
      bulletBody.position.copy(chassisBody.position);
      const direction = new CANNON.Vec3(0, 0, -1);
      direction.applyQuaternion(chassisBody.quaternion);
      bulletBody.velocity.copy(direction.scale(50));
      world.addBody(bulletBody);

      bullets.push({ mesh: bullet, body: bulletBody, shooterId: socket.id });
      playShootSound();
    }

    function respawn() {
      if (isDestroyed) {
        chassisBody.position.set(0, 2, 0);
        chassisBody.velocity.set(0, 0, 0);
        chassisBody.angularVelocity.set(0, 0, 0);
        chassisBody.quaternion.set(0, 0, 0, 1);
        world.addBody(chassisBody);
        vehicle.addToWorld(world);

        carData = createCar();
        car = carData.car;
        carWheels = carData.wheels;
        scene.add(car);
        nameSprite = createTextSprite(playerName);
        nameSprite.position.set(0, 2, 0);
        car.add(nameSprite);

        isDestroyed = false;
        health = 100;
        score = 0;
        socket.emit('move', {
          x: car.position.x,
          y: car.position.y,
          z: car.position.z,
          qx: chassisBody.quaternion.x,
          qy: chassisBody.quaternion.y,
          qz: chassisBody.quaternion.z,
          qw: chassisBody.quaternion.w,
          vx: chassisBody.velocity.x,
          vy: chassisBody.velocity.y,
          vz: chassisBody.velocity.z,
          health: health,
          name: playerName,
          score: score,
        });
        hud.textContent = `Score: ${score} - Health: ${health}`;
        leaderboardDiv.style.display = 'none';
      }
    }

    function createExplosion(position) {
      const particleCount = 20;
      const particles = new THREE.Group();
      const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
      const particleMaterial = new THREE.MeshPhongMaterial({ color: 0xff4500 });

      for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.copy(position);
        particle.velocity = new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          Math.random() * 5,
          (Math.random() - 0.5) * 5
        );
        particles.add(particle);
      }

      scene.add(particles);
      setTimeout(() => scene.remove(particles), 1000);

      const animateParticles = () => {
        particles.children.forEach((particle) => {
          particle.position.add(particle.velocity);
          particle.velocity.y -= 0.1;
        });
        if (particles.children.length > 0) requestAnimationFrame(animateParticles);
      };
      animateParticles();

      playExplosionSound();
    }

    function playComplexSound(frequencies, duration, types, volumes) {
      if (isMuted) return;
      frequencies.forEach((freq, i) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.type = types[i];
        oscillator.frequency.value = freq;
        gainNode.gain.value = volumes[i];
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
      });
    }

    function playEngineSound() {
      if (isMuted || isDestroyed) return;
      playComplexSound([100, 150], 0.1, ['sawtooth', 'sine'], [0.2, 0.1]);
      setTimeout(playEngineSound, 100);
    }

    function playShootSound() {
      playComplexSound([500, 700], 0.1, ['square', 'sine'], [0.4, 0.2]);
    }

    function playExplosionSound() {
      playComplexSound([80, 120, 200], 0.3, ['sawtooth', 'square', 'sine'], [0.6, 0.4, 0.2]);
    }

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    function animate() {
      requestAnimationFrame(animate);
      world.step(1 / 60);

      if (car && !isDestroyed) {
        updateVehicle();

        // Sync car body with chassis
        car.position.copy(chassisBody.position);
        car.quaternion.copy(chassisBody.quaternion);

        // Sync wheels with physics, ensuring proper alignment and rotation
        for (let i = 0; i < vehicle.wheelInfos.length; i++) {
          vehicle.updateWheelTransform(i);
          const transform = vehicle.wheelInfos[i].worldTransform;
          carWheels[i].position.copy(transform.position);
          carWheels[i].quaternion.copy(transform.quaternion);
          // Use deltaRotation for smooth wheel rotation, scaled appropriately
          const wheelSpeed = vehicle.wheelInfos[i].deltaRotation * 0.05; // Reduced for stability
          carWheels[i].rotation.x += wheelSpeed;
        }

        if (gameMode === 'deathmatch') {
          for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];
            bullet.mesh.position.copy(bullet.body.position);
            bullet.mesh.quaternion.copy(bullet.body.quaternion);
            if (bullet.mesh.position.length() > 50) {
              scene.remove(bullet.mesh);
              world.removeBody(bullet.body);
              bullets.splice(i, 1);
              continue;
            }

            for (let id in playerCars) {
              if (id === bullet.shooterId) continue;
              const distance = bullet.body.position.distanceTo(
                new CANNON.Vec3(players[id].x, players[id].y, players[id].z)
              );
              if (distance < 2) {
                socket.emit('damage', { targetId: id, amount: 20 });
                scene.remove(bullet.mesh);
                world.removeBody(bullet.body);
                bullets.splice(i, 1);
                break;
              }
            }
          }
        } else if (gameMode === 'race') {
          bullets.length = 0;
        }

        for (let i = collectibles.length - 1; i >= 0; i--) {
          const collectible = collectibles[i];
          const distance = chassisBody.position.distanceTo(collectible.body.position);
          if (distance < 2) {
            scene.remove(collectible.mesh);
            world.removeBody(collectible.body);
            collectibles.splice(i, 1);
            score += 1;
            socket.emit('move', {
              x: car.position.x,
              y: car.position.y,
              z: car.position.z,
              qx: chassisBody.quaternion.x,
              qy: chassisBody.quaternion.y,
              qz: chassisBody.quaternion.z,
              qw: chassisBody.quaternion.w,
              vx: chassisBody.velocity.x,
              vy: chassisBody.velocity.y,
              vz: chassisBody.velocity.z,
              health: health,
              name: playerName,
              score: score,
            });
            hud.textContent = `Score: ${score} - Health: ${health}`;
            console.log('Collected a coin!');
            if (gameMode === 'race' && score >= scoreToWin) {
              hud.textContent = `Score: ${score} - Health: ${health} - You Win! Press R to Restart`;
              isDestroyed = true;
              leaderboardDiv.style.display = 'block';
            }
          }
        }

        socket.emit('move', {
          x: car.position.x,
          y: car.position.y,
          z: car.position.z,
          qx: chassisBody.quaternion.x,
          qy: chassisBody.quaternion.y,
          qz: chassisBody.quaternion.z,
          qw: chassisBody.quaternion.w,
          vx: chassisBody.velocity.x,
          vy: chassisBody.velocity.y,
          vz: chassisBody.velocity.z,
          health: health,
          name: playerName,
          score: score,
        });
        camera.position.set(car.position.x, car.position.y + 15, car.position.z + 20);
        camera.lookAt(car.position);
      }
      renderer.render(scene, camera);
    }
    playEngineSound();
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  let health = 100;
  let score = 0;

  function createTextSprite(message) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = 'Bold 20px Arial';
    const width = context.measureText(message).width + 20;
    canvas.width = width;
    canvas.height = 40;
    context.font = 'Bold 20px Arial';
    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.fillText(message, 10, 30);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(width / 20, 1, 1);
    return sprite;
  }
});