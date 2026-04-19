#!/usr/bin/env bash
###############################################################################
# RaptorTracker — Server Installation Script
# Supports: Ubuntu 20.04/22.04/24.04 · Debian 11/12
#           CentOS 7/8 · AlmaLinux/Rocky Linux 8/9 · RHEL 8/9
###############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIN_NODE_MAJOR=20
STATE_FILE="/etc/raptortracker-install.conf"

###############################################################################
# Colors & logging
###############################################################################
if [[ -t 1 ]]; then
  RED='\033[0;31m'  GREEN='\033[0;32m'  YELLOW='\033[1;33m'
  BLUE='\033[0;34m' CYAN='\033[0;36m'   BOLD='\033[1m'
  DIM='\033[2m'     RESET='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' DIM='' RESET=''
fi

LOG_FILE="/tmp/raptortracker-install-$(date +%Y%m%d-%H%M%S).log"
touch "$LOG_FILE"

log()     { echo -e "${GREEN}[✔]${RESET} $*" | tee -a "$LOG_FILE"; }
info()    { echo -e "${CYAN}[→]${RESET} $*" | tee -a "$LOG_FILE"; }
warn()    { echo -e "${YELLOW}[!]${RESET} $*" | tee -a "$LOG_FILE"; }
error()   { echo -e "${RED}[✘]${RESET} $*" | tee -a "$LOG_FILE" >&2; }
section() { echo -e "\n${BOLD}${BLUE}══ $* ══${RESET}" | tee -a "$LOG_FILE"; }
die()     { error "$*"; echo -e "${DIM}See full log: $LOG_FILE${RESET}"; exit 1; }

run() {
  if ! "$@" >> "$LOG_FILE" 2>&1; then
    error "Command failed: $*"
    echo -e "${DIM}Last 20 lines of log:${RESET}"
    tail -20 "$LOG_FILE" >&2
    exit 1
  fi
}

run_visible() {
  "$@" 2>&1 | tee -a "$LOG_FILE"
  return "${PIPESTATUS[0]}"
}

###############################################################################
# Defaults
###############################################################################
INSTALL_DIR="/opt/raptortracker"
DATA_DIR="/opt/raptortracker/data"
APP_PORT="3000"
APP_USER="raptortracker"
DOMAIN="localhost"
ADMIN_USER="admin"
ADMIN_PASS=""
SESSION_SECRET=""
WEBSERVER_CHOICE=""
INSTALL_WEBSERVER="false"
INSTALL_FROM_LOCAL="false"
GIT_URL=""
CONFIGURE_FIREWALL="true"

# Set by detect_os
PKG_MGR=""
WEBSERVER_SVC_NGINX=""
WEBSERVER_SVC_APACHE=""
WEBSERVER_PKG_APACHE=""
APACHE_CONF_DIR=""
APACHE_ENABLE_CMD=""
APACHE_LOG_DIR=""
NGINX_CONF_DIR=""
NGINX_USE_SITES_ENABLED="false"

###############################################################################
# Helpers
###############################################################################
rand_str() {
  # Generate a random string; || true absorbs SIGPIPE from head
  tr -dc 'A-Za-z0-9!@#%^&*_-' < /dev/urandom 2>/dev/null | head -c "${1:-48}" || true
}

rand_pass() {
  tr -dc 'A-Za-z0-9@#%_-' < /dev/urandom 2>/dev/null | head -c 20 || true
}

###############################################################################
# Root check
###############################################################################
check_root() {
  [[ $EUID -eq 0 ]] || die "This script must be run as root.  Try: sudo bash install.sh"
}

###############################################################################
# OS detection
###############################################################################
detect_os() {
  section "Detecting Operating System"

  [[ -f /etc/os-release ]] || die "Cannot read /etc/os-release — unsupported OS."

  # shellcheck disable=SC1091
  source /etc/os-release
  local os_id="${ID:-unknown}"
  OS_PRETTY="${PRETTY_NAME:-unknown}"

  case "$os_id" in
    ubuntu|debian)
      PKG_MGR="apt"
      WEBSERVER_SVC_NGINX="nginx"
      WEBSERVER_SVC_APACHE="apache2"
      WEBSERVER_PKG_APACHE="apache2"
      APACHE_CONF_DIR="/etc/apache2/sites-available"
      APACHE_ENABLE_CMD="a2ensite"
      APACHE_LOG_DIR="/var/log/apache2"
      NGINX_CONF_DIR="/etc/nginx/sites-available"
      NGINX_USE_SITES_ENABLED="true"
      ;;
    centos|rhel|almalinux|rocky)
      if command -v dnf &>/dev/null; then PKG_MGR="dnf"; else PKG_MGR="yum"; fi
      WEBSERVER_SVC_NGINX="nginx"
      WEBSERVER_SVC_APACHE="httpd"
      WEBSERVER_PKG_APACHE="httpd"
      APACHE_CONF_DIR="/etc/httpd/conf.d"
      APACHE_ENABLE_CMD=""               # httpd reads conf.d automatically
      APACHE_LOG_DIR="/var/log/httpd"
      NGINX_CONF_DIR="/etc/nginx/conf.d" # no sites-enabled on RHEL family
      NGINX_USE_SITES_ENABLED="false"
      ;;
    *)
      die "Unsupported OS: $OS_PRETTY\nSupported: Ubuntu 20.04+, Debian 11+, CentOS 7/8, AlmaLinux/Rocky/RHEL 8/9"
      ;;
  esac

  log "Detected: $OS_PRETTY  (package manager: $PKG_MGR)"
}

###############################################################################
# Package manager helpers
###############################################################################
pkg_update() {
  info "Updating package index…"
  case "$PKG_MGR" in
    apt) run apt-get update -qq ;;
    dnf) run dnf makecache -q --refresh ;;
    yum) run yum makecache -q ;;
  esac
}

pkg_install() {
  info "Installing packages: $*"
  case "$PKG_MGR" in
    apt) run apt-get install -y -qq "$@" ;;
    dnf) run dnf install -y -q  "$@" ;;
    yum) run yum install -y -q  "$@" ;;
  esac
}

pkg_installed() {
  # Returns 0 if all listed packages are installed
  case "$PKG_MGR" in
    apt) dpkg -s "$@" &>/dev/null ;;
    dnf|yum) rpm -q "$@" &>/dev/null ;;
  esac
}

###############################################################################
# Install core system tools
# curl   — NodeSource setup + health check
# rsync  — file deployment
# git    — source cloning
###############################################################################
install_system_tools() {
  section "System Tools"

  local to_install=()

  command -v curl  &>/dev/null || to_install+=("curl")
  command -v rsync &>/dev/null || to_install+=("rsync")
  command -v git   &>/dev/null || to_install+=("git")

  if [[ ${#to_install[@]} -gt 0 ]]; then
    pkg_install "${to_install[@]}"
  fi

  log "curl $(curl --version | head -1 | awk '{print $2}')  rsync $(rsync --version | head -1 | awk '{print $3}')  git $(git --version | awk '{print $3}')"
}

###############################################################################
# Install build tools — required for better-sqlite3 native module
###############################################################################
install_build_tools() {
  section "Build Tools  (native SQLite module)"

  case "$PKG_MGR" in
    apt)
      if ! pkg_installed build-essential python3-minimal; then
        pkg_install build-essential python3-minimal
      else
        log "build-essential already present."
      fi
      ;;
    dnf|yum)
      if ! pkg_installed gcc gcc-c++ make python3; then
        pkg_install gcc gcc-c++ make python3
      else
        log "gcc/make already present."
      fi
      ;;
  esac

  log "Build tools ready."
}

###############################################################################
# Install Node.js 20+
###############################################################################
install_nodejs() {
  section "Node.js"

  if command -v node &>/dev/null; then
    local ver
    ver="$(node --version | sed 's/v//' | cut -d. -f1)"
    if (( ver >= MIN_NODE_MAJOR )); then
      log "Node.js $(node --version) already installed — satisfies >= v${MIN_NODE_MAJOR}."
      # npm may be a separate package on some distros even when node is present
      if command -v npm &>/dev/null; then
        log "npm $(npm --version) available."
      else
        warn "npm not found alongside existing Node.js — installing npm separately…"
        pkg_install npm
        command -v npm &>/dev/null || die "npm installation failed — check $LOG_FILE"
        log "npm $(npm --version) installed."
      fi
      return
    fi
    warn "Node.js $(node --version) found but v${MIN_NODE_MAJOR}+ is required — upgrading via NodeSource."
  else
    info "Node.js not found — installing v${MIN_NODE_MAJOR} via NodeSource…"
  fi

  case "$PKG_MGR" in
    apt)
      run curl -fsSL "https://deb.nodesource.com/setup_${MIN_NODE_MAJOR}.x" -o /tmp/nodesource_setup.sh
      run bash /tmp/nodesource_setup.sh
      pkg_install nodejs
      ;;
    dnf|yum)
      run curl -fsSL "https://rpm.nodesource.com/setup_${MIN_NODE_MAJOR}.x" -o /tmp/nodesource_setup.sh
      run bash /tmp/nodesource_setup.sh
      pkg_install nodejs
      # RHEL family needs nodejs-devel for native module compilation
      pkg_install nodejs-devel 2>/dev/null || true
      ;;
  esac

  rm -f /tmp/nodesource_setup.sh

  command -v node &>/dev/null || die "Node.js installation failed — check $LOG_FILE"

  local ver
  ver="$(node --version | sed 's/v//' | cut -d. -f1)"
  (( ver >= MIN_NODE_MAJOR )) || die "Node.js $(node --version) installed but v${MIN_NODE_MAJOR}+ required."

  # npm is bundled with NodeSource packages, but verify and install separately if absent
  if ! command -v npm &>/dev/null; then
    warn "npm not bundled — installing separately…"
    pkg_install npm
    command -v npm &>/dev/null || die "npm installation failed — check $LOG_FILE"
  fi

  log "Node.js $(node --version) and npm $(npm --version) installed."
}

###############################################################################
# Install/verify web server
###############################################################################
install_webserver() {
  section "Web Server"

  if [[ "$WEBSERVER_CHOICE" == "none" ]]; then
    warn "No web server — RaptorTracker will be reachable directly on port ${APP_PORT}."
    return
  fi

  if [[ "$INSTALL_WEBSERVER" == "false" ]]; then
    log "Using existing web server: ${WEBSERVER_CHOICE}"
    return
  fi

  case "$WEBSERVER_CHOICE" in
    nginx)
      pkg_install nginx
      systemctl enable nginx  >> "$LOG_FILE" 2>&1 || true
      systemctl start  nginx  >> "$LOG_FILE" 2>&1 || true
      log "nginx installed and started."
      ;;
    apache)
      pkg_install "$WEBSERVER_PKG_APACHE"
      if [[ "$PKG_MGR" == "apt" ]]; then
        run a2enmod proxy proxy_http headers rewrite
      fi
      systemctl enable "${WEBSERVER_SVC_APACHE}" >> "$LOG_FILE" 2>&1 || true
      systemctl start  "${WEBSERVER_SVC_APACHE}" >> "$LOG_FILE" 2>&1 || true
      log "${WEBSERVER_PKG_APACHE} installed and started."
      ;;
  esac
}

###############################################################################
# Install PM2
###############################################################################
install_pm2() {
  section "PM2"

  if command -v pm2 &>/dev/null; then
    log "PM2 $(pm2 --version) already installed."
    return
  fi
  info "Installing PM2 globally via npm…"
  run npm install -g pm2
  log "PM2 $(pm2 --version) installed."
}

###############################################################################
# Create service user
###############################################################################
create_service_user() {
  section "Service User"

  if id "$APP_USER" &>/dev/null; then
    log "User '${APP_USER}' already exists."
    return
  fi

  info "Creating system user '${APP_USER}'…"
  run useradd --system --shell /bin/bash --create-home \
      --comment "RaptorTracker service" "$APP_USER"
  log "User '${APP_USER}' created (home: /home/${APP_USER})."
}

###############################################################################
# Deploy application files
###############################################################################
deploy_app() {
  section "Deploying Application"

  mkdir -p "$INSTALL_DIR"

  if [[ "$INSTALL_FROM_LOCAL" == "true" ]]; then
    if [[ "$SCRIPT_DIR" == "$INSTALL_DIR" ]]; then
      info "Running in-place from install directory — no copy needed."
    else
      info "Copying source from ${SCRIPT_DIR} → ${INSTALL_DIR}…"
      rsync -a \
        --exclude='node_modules/' \
        --exclude='client/node_modules/' \
        --exclude='data/' \
        --exclude='dist/' \
        --exclude='.git/' \
        --exclude='.env' \
        "${SCRIPT_DIR}/" "${INSTALL_DIR}/"
      log "Source files copied."
    fi
  else
    if [[ -d "${INSTALL_DIR}/.git" ]]; then
      info "Existing git repo found — pulling latest…"
      run git -C "$INSTALL_DIR" pull
    elif [[ "$GIT_URL" =~ ^(/|\.) ]]; then
      info "Copying from local path ${GIT_URL}…"
      rsync -a \
        --exclude='node_modules/' \
        --exclude='client/node_modules/' \
        --exclude='data/' \
        --exclude='.git/' \
        "${GIT_URL}/" "${INSTALL_DIR}/"
    else
      info "Cloning from ${GIT_URL}…"
      run git clone "$GIT_URL" "$INSTALL_DIR"
    fi
    log "Application source ready at ${INSTALL_DIR}."
  fi

  mkdir -p "${DATA_DIR}/uploads"
  log "Data directory ready: ${DATA_DIR}"
}

###############################################################################
# Write .env
###############################################################################
write_env() {
  section "Environment File"

  local env_file="${INSTALL_DIR}/.env"

  if [[ -f "$env_file" ]] && ! grep -q "changeme" "$env_file" 2>/dev/null; then
    warn ".env already exists with custom values — not overwriting."
    warn "Verify DATA_DIR=${DATA_DIR} and UPLOAD_DIR=${DATA_DIR}/uploads are set correctly."
    return
  fi

  cat > "$env_file" <<EOF
PORT=${APP_PORT}
SESSION_SECRET=${SESSION_SECRET}
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}
DATA_DIR=${DATA_DIR}
UPLOAD_DIR=${DATA_DIR}/uploads
NODE_ENV=production
EOF

  chmod 600 "$env_file"
  log ".env written (permissions: 600)."
}

###############################################################################
# Install npm dependencies and build frontend
###############################################################################
install_dependencies() {
  section "npm Dependencies & Frontend Build"

  cd "$INSTALL_DIR"

  # When npm runs as root it attempts to fchown() extracted files; on some
  # filesystems this raises EINVAL.  Setting unsafe-perm suppresses those
  # harmless TAR_ENTRY_ERROR warnings without disabling script execution.
  export npm_config_unsafe_perm=true

  # Use 'npm ci' when a lockfile is present (faster, reproducible).
  # Fall back to 'npm install' when there is no lockfile (e.g. fresh clone
  # from a repo that doesn't commit package-lock.json).
  info "Installing server dependencies…"
  if [[ -f "${INSTALL_DIR}/package-lock.json" ]]; then
    info "  package-lock.json found — using npm ci --omit=dev"
    run_visible npm ci --omit=dev
  else
    info "  No package-lock.json — using npm install --omit=dev"
    run_visible npm install --omit=dev
  fi

  info "Installing frontend dependencies…"
  if [[ -f "${INSTALL_DIR}/client/package-lock.json" ]]; then
    info "  client/package-lock.json found — using npm ci"
    run_visible npm ci --prefix client
  else
    info "  No client/package-lock.json — using npm install"
    run_visible npm install --prefix client
  fi

  info "Building React frontend (Vite)…"
  run_visible npm run build

  log "All dependencies installed; frontend built."
}

###############################################################################
# Initialize database
###############################################################################
init_database() {
  section "Database"

  local db_path="${DATA_DIR}/raptortracker.db"

  if [[ -f "$db_path" ]]; then
    log "Database already exists at ${db_path} — skipping seed."
    return
  fi

  info "Creating SQLite database and seeding all Raptor vehicle data…"
  cd "$INSTALL_DIR"
  node server/db/init.js >> "$LOG_FILE" 2>&1
  log "Database created: ${db_path}"
}

###############################################################################
# File permissions
###############################################################################
set_permissions() {
  section "Permissions"

  chown -R "${APP_USER}:${APP_USER}" "$INSTALL_DIR"
  chmod 750  "$INSTALL_DIR"
  chmod 600  "${INSTALL_DIR}/.env"
  chmod 755  "${DATA_DIR}"
  chmod 755  "${DATA_DIR}/uploads"

  log "Owner: ${APP_USER}  |  .env: 600  |  data/: 755"
}

###############################################################################
# Configure nginx
###############################################################################
configure_nginx() {
  local conf_name="raptortracker.conf"

  # On Debian/Ubuntu use sites-available + symlink into sites-enabled.
  # On RHEL family, write directly into conf.d (nginx reads it automatically).
  local conf_path
  if [[ "$NGINX_USE_SITES_ENABLED" == "true" ]]; then
    conf_path="${NGINX_CONF_DIR}/${conf_name}"
  else
    # RHEL family: /etc/nginx/conf.d/
    conf_path="${NGINX_CONF_DIR}/${conf_name}"
    # Ensure conf.d exists (it should, but just in case)
    mkdir -p "$NGINX_CONF_DIR"
  fi

  info "Writing nginx config to ${conf_path}…"
  cat > "$conf_path" <<NGINX
# RaptorTracker — generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 50M;

    add_header X-Frame-Options        "SAMEORIGIN"                    always;
    add_header X-Content-Type-Options "nosniff"                       always;
    add_header X-XSS-Protection       "1; mode=block"                 always;
    add_header Referrer-Policy        "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass          http://127.0.0.1:${APP_PORT};
        proxy_http_version  1.1;
        proxy_set_header    Upgrade            \$http_upgrade;
        proxy_set_header    Connection         "upgrade";
        proxy_set_header    Host               \$host;
        proxy_set_header    X-Real-IP          \$remote_addr;
        proxy_set_header    X-Forwarded-For    \$proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto  \$scheme;
        proxy_cache_bypass  \$http_upgrade;
        proxy_read_timeout  300s;
        proxy_connect_timeout 75s;
    }
}
NGINX

  # On Debian/Ubuntu: create symlink in sites-enabled, remove default conflict
  if [[ "$NGINX_USE_SITES_ENABLED" == "true" ]]; then
    local enabled_dir="/etc/nginx/sites-enabled"
    mkdir -p "$enabled_dir"
    ln -sf "$conf_path" "${enabled_dir}/${conf_name}"

    local default_link="${enabled_dir}/default"
    if [[ -L "$default_link" ]]; then
      rm -f "$default_link"
      info "Removed default nginx site (port 80 conflict avoided)."
    fi
  fi

  # Validate and reload
  if nginx -t >> "$LOG_FILE" 2>&1; then
    systemctl reload nginx >> "$LOG_FILE" 2>&1 \
      || systemctl restart nginx >> "$LOG_FILE" 2>&1
    log "nginx configured and reloaded."
  else
    error "nginx config test failed — config written to ${conf_path}"
    error "Fix the config manually and run: systemctl reload nginx"
    error "RaptorTracker process is running; only the proxy is broken."
  fi
}

###############################################################################
# Configure Apache
###############################################################################
configure_apache() {
  local conf_path="${APACHE_CONF_DIR}/raptortracker.conf"

  # Enable required modules on Debian/Ubuntu (httpd on RHEL has them built in)
  if [[ "$PKG_MGR" == "apt" ]]; then
    run a2enmod proxy proxy_http headers
  fi

  info "Writing Apache config to ${conf_path}…"
  cat > "$conf_path" <<APACHE
# RaptorTracker — generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
<VirtualHost *:80>
    ServerName ${DOMAIN}

    LimitRequestBody 52428800

    Header always set X-Frame-Options        "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-XSS-Protection       "1; mode=block"

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:${APP_PORT}/
    ProxyPassReverse / http://127.0.0.1:${APP_PORT}/

    RequestHeader set X-Forwarded-Proto "http"

    ErrorLog  ${APACHE_LOG_DIR}/raptortracker-error.log
    CustomLog ${APACHE_LOG_DIR}/raptortracker-access.log combined
</VirtualHost>
APACHE

  # Enable the site (Debian/Ubuntu only — RHEL reads conf.d automatically)
  if [[ -n "$APACHE_ENABLE_CMD" ]]; then
    run "$APACHE_ENABLE_CMD" raptortracker
  fi

  # Validate and reload
  local test_cmd="apachectl"
  command -v apachectl &>/dev/null || test_cmd="httpd"

  if $test_cmd configtest >> "$LOG_FILE" 2>&1; then
    systemctl reload "${WEBSERVER_SVC_APACHE}"  >> "$LOG_FILE" 2>&1 \
      || systemctl restart "${WEBSERVER_SVC_APACHE}" >> "$LOG_FILE" 2>&1
    log "Apache configured and reloaded."
  else
    error "Apache config test failed — config written to ${conf_path}"
    error "Fix the config manually and run: systemctl reload ${WEBSERVER_SVC_APACHE}"
  fi
}

configure_webserver() {
  section "Web Server Configuration"
  case "$WEBSERVER_CHOICE" in
    nginx)  configure_nginx  ;;
    apache) configure_apache ;;
    none)   warn "No reverse proxy configured — app is on port ${APP_PORT} only." ;;
  esac
}

###############################################################################
# Configure PM2
###############################################################################
configure_pm2() {
  section "PM2 Process Manager"

  # Locate pm2 binary (npm global installs to various locations)
  local pm2_bin
  pm2_bin="$(command -v pm2)" || die "pm2 not found in PATH after installation."

  mkdir -p /var/log/raptortracker
  chown "${APP_USER}:${APP_USER}" /var/log/raptortracker

  # Write PM2 ecosystem file
  cat > "${INSTALL_DIR}/ecosystem.config.js" <<EOF
module.exports = {
  apps: [{
    name:              'raptortracker',
    script:            '${INSTALL_DIR}/server.js',
    cwd:               '${INSTALL_DIR}',
    instances:         1,
    autorestart:       true,
    watch:             false,
    max_memory_restart:'512M',
    error_file:        '/var/log/raptortracker/error.log',
    out_file:          '/var/log/raptortracker/out.log',
    log_date_format:   'YYYY-MM-DD HH:mm:ss',
    env: {
      NODE_ENV: 'production',
    },
  }]
};
EOF
  chown "${APP_USER}:${APP_USER}" "${INSTALL_DIR}/ecosystem.config.js"

  # Stop any previously running instance owned by the service user
  su -s /bin/bash -l "$APP_USER" -c \
    "PATH=${PATH}:$(dirname "$pm2_bin") pm2 delete raptortracker 2>/dev/null || true"

  # Start the app as the service user
  info "Starting RaptorTracker via PM2 as user '${APP_USER}'…"
  su -s /bin/bash -l "$APP_USER" -c \
    "PATH=${PATH}:$(dirname "$pm2_bin") pm2 start '${INSTALL_DIR}/ecosystem.config.js' --env production" \
    >> "$LOG_FILE" 2>&1

  # Register PM2 with systemd so it survives reboots.
  # Running 'pm2 startup' as root with -u generates and installs the unit file directly.
  info "Registering PM2 startup service (systemd)…"
  local pm2_home="/home/${APP_USER}"
  "$pm2_bin" startup systemd -u "$APP_USER" --hp "$pm2_home" >> "$LOG_FILE" 2>&1 || {
    warn "pm2 startup command failed — the app will run now but may not survive reboots."
    warn "After install, manually run: sudo pm2 startup systemd -u ${APP_USER} --hp ${pm2_home}"
  }

  # Save the process list for the service user
  su -s /bin/bash -l "$APP_USER" -c \
    "PATH=${PATH}:$(dirname "$pm2_bin") pm2 save" >> "$LOG_FILE" 2>&1

  log "PM2 configured; systemd service registered."
}

###############################################################################
# Firewall
###############################################################################
configure_firewall() {
  section "Firewall"

  if [[ "$CONFIGURE_FIREWALL" == "false" ]]; then
    info "Skipping firewall configuration (user request)."
    return
  fi

  # ufw — Ubuntu/Debian
  if command -v ufw &>/dev/null; then
    if ufw status 2>/dev/null | grep -q "Status: active"; then
      info "ufw active — allowing HTTP…"
      run ufw allow 80/tcp
      if [[ "$WEBSERVER_CHOICE" == "none" ]]; then
        run ufw allow "${APP_PORT}/tcp"
        log "ufw: port ${APP_PORT} allowed (standalone mode)."
      fi
      log "ufw: HTTP (port 80) allowed."
    else
      info "ufw installed but inactive — skipping."
    fi
    return
  fi

  # firewalld — CentOS/RHEL/AlmaLinux
  if command -v firewall-cmd &>/dev/null; then
    if systemctl is-active --quiet firewalld 2>/dev/null; then
      info "firewalld active — allowing HTTP…"
      run firewall-cmd --permanent --add-service=http
      if [[ "$WEBSERVER_CHOICE" == "none" ]]; then
        run firewall-cmd --permanent --add-port="${APP_PORT}/tcp"
        log "firewalld: port ${APP_PORT} allowed (standalone mode)."
      fi
      run firewall-cmd --reload
      log "firewalld: HTTP allowed."
    else
      info "firewalld installed but inactive — skipping."
    fi
    return
  fi

  info "No recognized firewall (ufw / firewalld) detected — skipping."
}

###############################################################################
# Verify required npm packages (archiver, adm-zip) are installed
# These may be absent if package-lock.json predates their addition to
# package.json, or if npm ci was run without them.
###############################################################################
verify_npm_packages() {
  section "Verifying Required npm Packages"

  cd "$INSTALL_DIR"

  local required_pkgs=("archiver" "adm-zip")
  local missing=()

  for pkg in "${required_pkgs[@]}"; do
    if node -e "require('${pkg}')" >> "$LOG_FILE" 2>&1; then
      log "  ${pkg}: present"
    else
      warn "  ${pkg}: NOT FOUND"
      missing+=("$pkg")
    fi
  done

  if [[ ${#missing[@]} -eq 0 ]]; then
    log "All required npm packages are present."
    return
  fi

  info "Installing missing packages: ${missing[*]}"
  run_visible npm install "${missing[@]}"

  # Verify each missing package now resolves
  local still_missing=()
  for pkg in "${missing[@]}"; do
    if node -e "require('${pkg}')" >> "$LOG_FILE" 2>&1; then
      log "  ${pkg}: installed successfully"
    else
      still_missing+=("$pkg")
    fi
  done

  if [[ ${#still_missing[@]} -gt 0 ]]; then
    die "Failed to install npm package(s): ${still_missing[*]}. Check $LOG_FILE for details."
  fi

  log "All required npm packages are present."
}

###############################################################################
# Health check
###############################################################################
health_check() {
  section "Health Check"
  info "Waiting for RaptorTracker to respond on port ${APP_PORT}…"

  local i=0
  while (( i < 15 )); do
    local code
    code="$(curl -s -o /dev/null -w "%{http_code}" \
            "http://127.0.0.1:${APP_PORT}/api/auth/me" 2>/dev/null || true)"
    if [[ "$code" =~ ^(200|401)$ ]]; then
      log "Application responding — HTTP ${code} on port ${APP_PORT}."
      return
    fi
    i=$(( i + 1 ))
    sleep 2
  done

  warn "No response after 30 s — application may still be starting."
  warn "Check logs: sudo su -l ${APP_USER} -c 'pm2 logs raptortracker --lines 30'"
}

###############################################################################
# Save install state (read by uninstall.sh)
###############################################################################
save_state() {
  cat > "$STATE_FILE" <<EOF
# RaptorTracker install state — written by install.sh
# DO NOT edit manually; used by uninstall.sh
INSTALL_DIR=${INSTALL_DIR}
DATA_DIR=${DATA_DIR}
APP_PORT=${APP_PORT}
APP_USER=${APP_USER}
WEBSERVER_CHOICE=${WEBSERVER_CHOICE}
NGINX_CONF_DIR=${NGINX_CONF_DIR}
NGINX_USE_SITES_ENABLED=${NGINX_USE_SITES_ENABLED}
APACHE_CONF_DIR=${APACHE_CONF_DIR}
WEBSERVER_SVC_APACHE=${WEBSERVER_SVC_APACHE}
DOMAIN=${DOMAIN}
INSTALL_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
  chmod 600 "$STATE_FILE"
  log "Install state saved to ${STATE_FILE}."
}

###############################################################################
# Interactive configuration prompts
###############################################################################
prompt_config() {
  section "Configuration"
  echo -e "${BOLD}Press Enter to accept the value shown in [brackets].${RESET}\n"

  # ── Source detection ──────────────────────────────────────────────────────
  if [[ -f "${SCRIPT_DIR}/package.json" ]] \
     && grep -q '"name": "raptortracker"' "${SCRIPT_DIR}/package.json" 2>/dev/null; then
    INSTALL_FROM_LOCAL="true"
    info "RaptorTracker source detected in current directory: ${SCRIPT_DIR}"
    read -r -p "  Use this directory as the source? [Y/n]: " _a
    if [[ "${_a,,}" == "n" ]]; then INSTALL_FROM_LOCAL="false"; fi
  fi

  if [[ "$INSTALL_FROM_LOCAL" == "false" ]]; then
    read -r -p "  Git repository URL or local path to source: " GIT_URL
    [[ -n "$GIT_URL" ]] || die "Source URL or path is required."
  fi

  # ── Paths & runtime ───────────────────────────────────────────────────────
  read -r -p "  Install directory [${INSTALL_DIR}]: " _a
  if [[ -n "$_a" ]]; then INSTALL_DIR="$_a"; fi
  DATA_DIR="${INSTALL_DIR}/data"

  read -r -p "  Application port [${APP_PORT}]: " _a
  if [[ -n "$_a" ]]; then APP_PORT="$_a"; fi

  read -r -p "  Service account username [${APP_USER}]: " _a
  if [[ -n "$_a" ]]; then APP_USER="$_a"; fi

  read -r -p "  Server domain or IP (e.g. raptor.local) [${DOMAIN}]: " _a
  if [[ -n "$_a" ]]; then DOMAIN="$_a"; fi

  # ── Admin credentials ─────────────────────────────────────────────────────
  echo ""
  read -r -p "  RaptorTracker admin username [${ADMIN_USER}]: " _a
  if [[ -n "$_a" ]]; then ADMIN_USER="$_a"; fi

  read -r -s -p "  RaptorTracker admin password [auto-generate]: " ADMIN_PASS; echo ""
  if [[ -z "$ADMIN_PASS" ]]; then
    ADMIN_PASS="$(rand_pass)"
    warn "Password auto-generated — it will be shown at the end of installation."
  fi

  SESSION_SECRET="$(rand_str 64)"

  # ── Web server ────────────────────────────────────────────────────────────
  echo ""
  info "Scanning for installed web servers…"

  local found_nginx="false" found_apache="false"

  if systemctl list-unit-files 2>/dev/null | grep -q "^${WEBSERVER_SVC_NGINX}"; then
    found_nginx="true"; log "Detected nginx."
  elif command -v nginx &>/dev/null; then
    found_nginx="true"; log "Detected nginx binary."
  fi

  if systemctl list-unit-files 2>/dev/null | grep -q "^${WEBSERVER_SVC_APACHE}"; then
    found_apache="true"; log "Detected ${WEBSERVER_SVC_APACHE}."
  elif command -v apache2 &>/dev/null || command -v httpd &>/dev/null; then
    found_apache="true"; log "Detected apache2/httpd binary."
  fi

  if [[ "$found_nginx" == "true" && "$found_apache" == "false" ]]; then
    WEBSERVER_CHOICE="nginx"
    info "Auto-selected web server: nginx"
  elif [[ "$found_apache" == "true" && "$found_nginx" == "false" ]]; then
    WEBSERVER_CHOICE="apache"
    info "Auto-selected web server: apache"
  elif [[ "$found_nginx" == "true" && "$found_apache" == "true" ]]; then
    echo "  Both nginx and apache found. Which should RaptorTracker use?"
    echo "    1) nginx  (recommended)"
    echo "    2) apache"
    read -r -p "  Choice [1]: " _a
    if [[ "${_a}" == "2" ]]; then WEBSERVER_CHOICE="apache"; else WEBSERVER_CHOICE="nginx"; fi
  else
    warn "No web server detected."
    echo "  Options:"
    echo "    1) Install nginx  (recommended)"
    echo "    2) Install apache"
    echo "    3) No web server — direct access on port ${APP_PORT}"
    read -r -p "  Choice [1]: " _a
    case "${_a:-1}" in
      2) WEBSERVER_CHOICE="apache"; INSTALL_WEBSERVER="true" ;;
      3) WEBSERVER_CHOICE="none" ;;
      *) WEBSERVER_CHOICE="nginx";  INSTALL_WEBSERVER="true" ;;
    esac
  fi

  # ── Firewall ──────────────────────────────────────────────────────────────
  echo ""
  read -r -p "  Configure firewall to open HTTP? [Y/n]: " _a
  if [[ "${_a,,}" == "n" ]]; then CONFIGURE_FIREWALL="false"; fi

  # ── Confirm ───────────────────────────────────────────────────────────────
  echo ""
  echo -e "${BOLD}${GREEN}Review your choices:${RESET}"
  printf "  %-20s %s\n" "Install dir:"   "$INSTALL_DIR"
  printf "  %-20s %s\n" "Data dir:"      "$DATA_DIR"
  printf "  %-20s %s\n" "Port:"          "$APP_PORT"
  printf "  %-20s %s\n" "Service user:"  "$APP_USER"
  printf "  %-20s %s\n" "Domain:"        "$DOMAIN"
  printf "  %-20s %s\n" "Admin user:"    "$ADMIN_USER"
  printf "  %-20s %s\n" "Web server:"    "$WEBSERVER_CHOICE"
  printf "  %-20s %s\n" "Firewall:"      "$CONFIGURE_FIREWALL"
  echo ""
  read -r -p "Proceed with installation? [Y/n]: " _a
  if [[ "${_a,,}" == "n" ]]; then info "Installation cancelled."; exit 0; fi
}

###############################################################################
# Final summary
###############################################################################
print_summary() {
  local access_url
  if [[ "$WEBSERVER_CHOICE" == "none" ]]; then
    access_url="http://${DOMAIN}:${APP_PORT}"
  else
    access_url="http://${DOMAIN}"
  fi

  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${GREEN}║          RaptorTracker Installation Complete            ║${RESET}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  ${BOLD}URL:${RESET}             ${CYAN}${access_url}${RESET}"
  echo -e "  ${BOLD}Admin username:${RESET}  ${CYAN}${ADMIN_USER}${RESET}"
  echo -e "  ${BOLD}Admin password:${RESET}  ${YELLOW}${ADMIN_PASS}${RESET}"
  echo ""
  echo -e "  ${BOLD}Install dir:${RESET}     ${INSTALL_DIR}"
  echo -e "  ${BOLD}Data / DB:${RESET}       ${DATA_DIR}"
  echo -e "  ${BOLD}PM2 logs:${RESET}        /var/log/raptortracker/"
  echo -e "  ${BOLD}Install log:${RESET}     ${LOG_FILE}"
  echo ""
  echo -e "  ${BOLD}Operations:${RESET}"
  echo -e "  ${DIM}Status:${RESET}    sudo -u ${APP_USER} pm2 list"
  echo -e "  ${DIM}Logs:${RESET}      sudo -u ${APP_USER} pm2 logs raptortracker"
  echo -e "  ${DIM}Restart:${RESET}   sudo -u ${APP_USER} pm2 restart raptortracker"
  echo -e "  ${DIM}Stop:${RESET}      sudo -u ${APP_USER} pm2 stop raptortracker"
  echo -e "  ${DIM}Uninstall:${RESET} sudo bash ${INSTALL_DIR}/uninstall.sh"
  echo ""
  echo -e "  ${YELLOW}Save your admin password — it will not be displayed again.${RESET}"
  echo ""
}

###############################################################################
# Main
###############################################################################
main() {
  clear
  echo -e "${BOLD}${CYAN}"
  cat <<'BANNER'
  ██████╗  █████╗ ██████╗ ████████╗ ██████╗ ██████╗
  ██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██╔═══██╗██╔══██╗
  ██████╔╝███████║██████╔╝   ██║   ██║   ██║██████╔╝
  ██╔══██╗██╔══██║██╔═══╝    ██║   ██║   ██║██╔══██╗
  ██║  ██║██║  ██║██║        ██║   ╚██████╔╝██║  ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝    ╚═════╝ ╚═╝  ╚═╝
BANNER
  echo -e "${RESET}"
  echo -e "  ${BOLD}Ford Raptor Build Tracker — Server Installer${RESET}"
  echo -e "  ${DIM}Install log: ${LOG_FILE}${RESET}"
  echo ""

  check_root
  detect_os
  prompt_config

  pkg_update
  install_system_tools    # curl, rsync, git
  install_build_tools     # gcc / build-essential
  install_nodejs          # Node.js 20+
  install_webserver       # nginx or apache (if installing new)
  install_pm2
  create_service_user
  deploy_app
  write_env
  install_dependencies    # npm ci + vite build
  verify_npm_packages     # ensure archiver + adm-zip are present
  init_database
  set_permissions
  configure_webserver     # write proxy config + reload
  configure_pm2           # start app + systemd unit
  configure_firewall
  save_state
  health_check
  print_summary
}

main "$@"
