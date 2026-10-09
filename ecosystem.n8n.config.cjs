module.exports = {
  apps: [{
    name: "n8n",
    script: "/home/jim/.nvm/versions/node/v24.21.0/bin/node",
    args: "--env-file=/home/jim/Desktop/classes/.env.local /home/jim/.nvm/versions/node/v24.21.0/bin/n8n start",
    cwd: "/home/jim/Desktop/classes",
    env: {
      N8N_HOST: "127.0.0.1",
      N8N_PORT: "5678",
      N8N_BLOCK_ENV_ACCESS_IN_NODE: "false"
    }
  }]
};
