pipeline {
  agent any

  stages {
    stage('Clone Repo') {
      steps {
        git 'https://github.com/majidansari786/simple-html.git'
      }
    }

    stage('Build Image') {
      steps {
        sh 'docker build -t codtech-app .'
      }
    }

    stage('Run App') {
      steps {
        sh 'docker run -d -p 8080:80 --name codtech-app codtech-app'
      }
    }

    stage('OWASP ZAP Scan') {
      steps {
        sh '''
        docker run -v $WORKSPACE:/zap/wrk:rw -t owasp/zap2docker-stable zap-baseline.py \
          -t http://host.docker.internal:8080 \
          -g gen.conf -r zap-report.html
        '''
      }
    }

    stage('Archive Report') {
      steps {
        archiveArtifacts artifacts: 'zap-report.html', fingerprint: true
      }
    }

    stage('Clean Up') {
      steps {
        sh 'docker stop codtech-app || true && docker rm codtech-app || true'
      }
    }
  }
}
