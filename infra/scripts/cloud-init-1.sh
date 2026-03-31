#!/bin/bash
# 1. Create 4GB Swap file for Rust compilation safety
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 2. Install Docker & Docker Compose
apt-get update
apt-get install -y docker.io docker-compose-v2
systemctl enable docker
systemctl start docker
usermod -aG docker azureuser

# 3. Install Rust (Toolchain)
sudo apt install -y curl build-essential
sudo -u azureuser -i bash -c 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y'

# 4. Install Azure CLI (to pull dataset from blob)
curl -sL https://aka.ms/InstallAzureCLIDeb | bash

# 5. Export Storage Account Name to easily pull dataset
echo "export STORAGE_ACCOUNT=__STORAGE_ACCOUNT_NAME__" >> /etc/profile.d/azure_env.sh
chmod +x /etc/profile.d/azure_env.sh

# 6. Install code cli
sudo apt update && sudo apt install software-properties-common apt-transport-https wget -y
wget -O- https://packages.microsoft.com/keys/microsoft.asc | sudo gpg --dearmor | sudo tee /usr/share/keyrings/vscode.gpg
echo deb [arch=amd64 signed-by=/usr/share/keyrings/vscode.gpg] https://packages.microsoft.com/repos/vscode stable main | sudo tee /etc/apt/sources.list.d/vscode.list
sudo apt update
sudo apt install code -y

# 7. install nodejs & pnpm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
nvm install --lts

curl -fsSL https://get.pnpm.io/install.sh | sh -
export PNPM_HOME="/home/azureuser/.local/share/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac