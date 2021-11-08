DEPLOY_TARGET=davinci
DEPLOYMENT_DIR=app
HOST_USER=root
SSH_KEY_PATH="$HOME/.ssh/erdem"
SSH_PATH="$HOST_USER@$DEPLOY_TARGET"
SSH_TARGET="$SSH_PATH:$DEPLOYMENT_DIR"
SRC_FILES='./dist ./config .env Dockerfile docker-compose.yml yarn.lock package.json'
SSH_COMMAND="cd app && sudo docker-compose up -d --build && sudo docker system prune -af";

yarn build
rsync -avz -e "ssh -i $SSH_KEY_PATH" $SRC_FILES $SSH_TARGET
ssh -i $SSH_KEY_PATH $SSH_PATH $SSH_COMMAND
