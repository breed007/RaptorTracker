#!/usr/bin/env bash
###############################################################################
# RaptorTracker — Uninstall Script
# Reads /etc/raptortracker-install.conf written by install.sh.
# Falls back to interactive prompts if the state file is missing.
###############################################################################
set -euo pipefail

STATE_FILE="/etc/raptortracker-install.conf"
LOG_FILE="/tmp/raptortracker-uninstall-$(date +%Y%m%d-%H%M%S).log"
touch "$LOG_FILE"

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

log()     { echo -e "${GREEN}[✔]${RESET} $*" | tee -a "$LOG_FILE"; }
info()    { echo -e "${CYAN}[→]${RESET} $*" | tee -a "$LOG_FILE"; }
warn()    { echo -e "${YELLOW}[!]${RESET} $*" | tee -a "$LOG_FILE"; }
error()   { echo -e "${RED}[✘]${RESET} $*" | tee -a "$LOG_FILE" >&2; }
section() { echo -e "\n${BOLD}${BLUE}══ $* ══${RESET}" | tee -a "$LOG_FILE"; }
die()     { error "$*"; echo -e "${DIM}Log: $LOG_FILE${RESET}"; exit 1; }

try() {
  # Run a command, log failures as warnings rather than dying
  if ! "$@" >> "$LOG_FILE" 2>&1; then
    warn "Non-fatal: $* returned non-zero (continuing)"
  fi
}

###############################################################################
# Root check
###############################################################################
[[ $EUID -eq 0 ]] || die "Must be run as root.  Try: sudo bash uninstall.sh"

###############################################################################
# Load install state
###############################################################################
INSTALL_DIR=""
DATA_DIR=""
APP_PORT="3000"
APP_USER="raptortracker"
WEBSERVER_CHOICE=""
NGINX_CONF_DIR=""
NGINX_USE_SITES_ENABLED="false"
APACHE_CONF_DIR=""
WEBSERVER_SVC_APACHE=""
DOMAIN=""

load_state() {
  if [[ -f "$STATE_FILE" ]]; then
    info "Reading install state from ${STATE_FILE}…"
    # shellcheck disable=SC1090
    source "$STATE_FILE"
    log "State loaded — install dir: ${INSTALL_DIR}"
  else
    warn "State file ${STATE_FILE} not found — entering manual mode."
    echo ""
    read -r -p "  RaptorTracker install directory [/opt/raptortracker]: " _a
    INSTALL_DIR="${_a:-/opt/raptortracker}"
    DATA_DIR="${INSTALL_DIR}/data"

    read -r -p "  Service account username [raptortracker]: " _a
    APP_USER="${_a:-raptortracker}"

    echo "  Web server used?"
    echo "    1) nginx"
    echo "    2) apache"
    echo "    3) none (standalone)"
    read -r -p "  Choice [1]: " _a
    case "${_a:-1}" in
      2) WEBSERVER_CHOICE="apache" ;;
      3) WEBSERVER_CHOICE="none"   ;;
      *) WEBSERVER_CHOICE="nginx"  ;;
    esac

    # Determine NGINX_CONF_DIR heuristically
    if [[ -d /etc/nginx/sites-available ]]; then
      NGINX_CONF_DIR="/etc/nginx/sites-available"
      NGINX_USE_SITES_ENABLED="true"
    else
      NGINX_CONF_DIR="/etc/nginx/conf.d"
      NGINX_USE_SITES_ENABLED="false"
    fi

    if [[ -d /etc/apache2 ]]; then
      APACHE_CONF_DIR="/etc/apache2/sites-available"
      WEBSERVER_SVC_APACHE="apache2"
    else
      APACHE_CONF_DIR="/etc/httpd/conf.d"
      WEBSERVER_SVC_APACHE="httpd"
    fi
  fi

  # Sanity check
  [[ -n "$INSTALL_DIR" ]] || die "Install directory could not be determined."
  [[ -n "$DATA_DIR"    ]] || DATA_DIR="${INSTALL_DIR}/data"
}

###############################################################################
# Confirm with the user — three separate consent gates
###############################################################################
confirm_uninstall() {
  section "Uninstall RaptorTracker"

  echo -e "${YELLOW}This will permanently remove the RaptorTracker application.${RESET}"
  echo ""
  echo -e "  Install dir:  ${INSTALL_DIR}"
  echo -e "  Data dir:     ${DATA_DIR}"
  echo -e "  Service user: ${APP_USER}"
  echo -e "  Web server:   ${WEBSERVER_CHOICE:-unknown}"
  echo ""

  # Gate 1 — proceed at all?
  read -r -p "Continue with uninstall? [y/N]: " _a
  [[ "${_a,,}" == "y" ]] || { info "Uninstall cancelled."; exit 0; }

  # Gate 2 — remove user data (SQLite DB + uploads)?
  echo ""
  echo -e "  ${BOLD}Data directory:${RESET} ${DATA_DIR}"
  echo -e "  Contains your SQLite database and all uploaded photos."
  echo ""
  read -r -p "  Delete data directory (database + photos)? [y/N]: " _a
  REMOVE_DATA="false"
  [[ "${_a,,}" == "y" ]] && REMOVE_DATA="true"

  if [[ "$REMOVE_DATA" == "true" ]]; then
    echo ""
    echo -e "  ${RED}${BOLD}WARNING: This is irreversible. All mod records, photos, and${RESET}"
    echo -e "  ${RED}${BOLD}maintenance history will be permanently deleted.${RESET}"
    read -r -p "  Type YES to confirm permanent data deletion: " _confirm
    [[ "$_confirm" == "YES" ]] || { warn "Data deletion cancelled — data will be preserved."; REMOVE_DATA="false"; }
  fi

  # Gate 3 — remove service user?
  echo ""
  read -r -p "  Remove service account '${APP_USER}'? [y/N]: " _a
  REMOVE_USER="false"
  [[ "${_a,,}" == "y" ]] && REMOVE_USER="true"

  echo ""
  echo -e "${BOLD}Uninstall plan:${RESET}"
  printf "  %-35s %s\n" "Stop & remove PM2 process:"        "yes"
  printf "  %-35s %s\n" "Remove PM2 systemd unit:"          "yes"
  printf "  %-35s %s\n" "Remove web server config:"         "${WEBSERVER_CHOICE:-none}"
  printf "  %-35s %s\n" "Remove application files:"         "yes (${INSTALL_DIR})"
  printf "  %-35s %s\n" "Remove data (DB + photos):"        "$REMOVE_DATA"
  printf "  %-35s %s\n" "Remove service account:"           "$REMOVE_USER"
  echo ""
  read -r -p "Execute? [y/N]: " _a
  [[ "${_a,,}" == "y" ]] || { info "Uninstall cancelled."; exit 0; }
}

###############################################################################
# Step 1 — Stop and remove PM2 process
###############################################################################
stop_pm2() {
  section "Stopping PM2 Process"

  local pm2_bin
  pm2_bin="$(command -v pm2 2>/dev/null || true)"

  if [[ -z "$pm2_bin" ]]; then
    warn "pm2 not found in PATH — skipping PM2 teardown."
    return
  fi

  if id "$APP_USER" &>/dev/null; then
    info "Stopping raptortracker process owned by '${APP_USER}'…"
    try su -s /bin/bash -l "$APP_USER" -c \
        "PATH=${PATH}:$(dirname "$pm2_bin") pm2 stop raptortracker"
    try su -s /bin/bash -l "$APP_USER" -c \
        "PATH=${PATH}:$(dirname "$pm2_bin") pm2 delete raptortracker"
    try su -s /bin/bash -l "$APP_USER" -c \
        "PATH=${PATH}:$(dirname "$pm2_bin") pm2 save --force"
    log "PM2 process stopped and removed."
  else
    warn "Service user '${APP_USER}' not found — trying root pm2 list cleanup."
    try pm2 delete raptortracker
  fi
}

###############################################################################
# Step 2 — Remove PM2 systemd unit
###############################################################################
remove_pm2_systemd() {
  section "PM2 Systemd Unit"

  local pm2_bin
  pm2_bin="$(command -v pm2 2>/dev/null || true)"

  # Find the unit file — pm2 names it pm2-<user>.service
  local unit_name="pm2-${APP_USER}.service"
  local unit_path="/etc/systemd/system/${unit_name}"

  if systemctl list-unit-files 2>/dev/null | grep -q "^${unit_name}"; then
    info "Disabling and removing ${unit_name}…"
    try systemctl stop    "$unit_name"
    try systemctl disable "$unit_name"
    [[ -f "$unit_path" ]] && rm -f "$unit_path"
    try systemctl daemon-reload
    log "Systemd unit ${unit_name} removed."
  else
    info "No systemd unit ${unit_name} found — nothing to remove."
  fi

  # Also ask pm2 to clean up its own startup artifacts (best-effort)
  if [[ -n "$pm2_bin" ]] && id "$APP_USER" &>/dev/null; then
    try su -s /bin/bash -l "$APP_USER" -c \
        "PATH=${PATH}:$(dirname "$pm2_bin") pm2 unstartup systemd 2>/dev/null || true"
  fi
}

###############################################################################
# Step 3 — Remove web server config
###############################################################################
remove_webserver_config() {
  section "Web Server Configuration"

  case "${WEBSERVER_CHOICE:-none}" in
    nginx)
      local conf_name="raptortracker.conf"

      if [[ "$NGINX_USE_SITES_ENABLED" == "true" ]]; then
        local enabled_link="/etc/nginx/sites-enabled/${conf_name}"
        local avail_conf="${NGINX_CONF_DIR}/${conf_name}"

        [[ -L "$enabled_link" ]] && { rm -f "$enabled_link"; info "Removed symlink: ${enabled_link}"; }
        [[ -f "$avail_conf"   ]] && { rm -f "$avail_conf";   info "Removed config:  ${avail_conf}"; }
      else
        local conf_path="${NGINX_CONF_DIR}/${conf_name}"
        [[ -f "$conf_path" ]] && { rm -f "$conf_path"; info "Removed: ${conf_path}"; }
      fi

      if command -v nginx &>/dev/null; then
        if nginx -t >> "$LOG_FILE" 2>&1; then
          try systemctl reload nginx
          log "nginx reloaded."
        else
          warn "nginx config test failed after removing RaptorTracker config — manual fix needed."
        fi
      fi
      ;;

    apache)
      local conf_path="${APACHE_CONF_DIR}/raptortracker.conf"

      # Debian/Ubuntu: disable site first
      if command -v a2dissite &>/dev/null; then
        try a2dissite raptortracker
      fi

      [[ -f "$conf_path" ]] && { rm -f "$conf_path"; info "Removed: ${conf_path}"; }

      local svc="${WEBSERVER_SVC_APACHE:-apache2}"
      if systemctl is-active --quiet "$svc" 2>/dev/null; then
        local test_cmd="apachectl"
        command -v apachectl &>/dev/null || test_cmd="httpd"
        if $test_cmd configtest >> "$LOG_FILE" 2>&1; then
          try systemctl reload "$svc"
          log "${svc} reloaded."
        else
          warn "Apache config test failed after removing RaptorTracker config — manual fix needed."
        fi
      fi
      ;;

    none|"")
      info "No web server config to remove (standalone mode)."
      ;;
  esac
}

###############################################################################
# Step 4 — Remove application files
###############################################################################
remove_app_files() {
  section "Application Files"

  if [[ -d "$INSTALL_DIR" ]]; then
    info "Removing ${INSTALL_DIR}…"
    rm -rf "$INSTALL_DIR"
    log "Application directory removed."
  else
    info "Install directory ${INSTALL_DIR} not found — already removed."
  fi
}

###############################################################################
# Step 5 — Remove data (conditional — requires double confirmation above)
###############################################################################
remove_data_dir() {
  section "Data Directory"

  if [[ "$REMOVE_DATA" == "true" ]]; then
    # INSTALL_DIR already removed above; DATA_DIR may be inside or separate
    if [[ -d "$DATA_DIR" ]]; then
      info "Removing ${DATA_DIR}…"
      rm -rf "$DATA_DIR"
      log "Data directory removed."
    else
      info "Data directory ${DATA_DIR} not found — already removed."
    fi
  else
    if [[ -d "$DATA_DIR" ]]; then
      log "Data preserved at: ${DATA_DIR}"
    fi
  fi
}

###############################################################################
# Step 6 — Remove PM2 log directory
###############################################################################
remove_log_dir() {
  section "Log Directory"

  if [[ -d /var/log/raptortracker ]]; then
    info "Removing /var/log/raptortracker…"
    rm -rf /var/log/raptortracker
    log "Log directory removed."
  else
    info "/var/log/raptortracker not found — nothing to do."
  fi
}

###############################################################################
# Step 7 — Remove service user (optional)
###############################################################################
remove_service_user() {
  section "Service Account"

  if [[ "$REMOVE_USER" != "true" ]]; then
    info "Keeping service account '${APP_USER}' (user request)."
    return
  fi

  if ! id "$APP_USER" &>/dev/null; then
    info "User '${APP_USER}' does not exist — nothing to remove."
    return
  fi

  info "Removing user '${APP_USER}' and home directory…"
  try userdel --remove "$APP_USER"
  log "User '${APP_USER}' removed."
}

###############################################################################
# Step 8 — Remove state file
###############################################################################
remove_state_file() {
  [[ -f "$STATE_FILE" ]] && { rm -f "$STATE_FILE"; log "State file ${STATE_FILE} removed."; }
}

###############################################################################
# Summary
###############################################################################
print_summary() {
  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${GREEN}║            RaptorTracker Uninstall Complete             ║${RESET}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  Application files:  ${GREEN}removed${RESET}"
  echo -e "  PM2 process:        ${GREEN}stopped and deleted${RESET}"
  echo -e "  Systemd unit:       ${GREEN}removed${RESET}"
  echo -e "  Web server config:  ${GREEN}removed${RESET}"

  if [[ "$REMOVE_DATA" == "true" ]]; then
    echo -e "  Data (DB/photos):   ${RED}permanently deleted${RESET}"
  else
    echo -e "  Data (DB/photos):   ${YELLOW}preserved at ${DATA_DIR}${RESET}"
  fi

  if [[ "$REMOVE_USER" == "true" ]]; then
    echo -e "  Service account:    ${GREEN}removed${RESET}"
  else
    echo -e "  Service account:    ${YELLOW}'${APP_USER}' kept${RESET}"
  fi

  echo ""
  echo -e "  ${DIM}Uninstall log: ${LOG_FILE}${RESET}"
  echo ""
}

###############################################################################
# Main
###############################################################################
main() {
  clear
  echo -e "${BOLD}${RED}"
  cat <<'BANNER'
  ██████╗  █████╗ ██████╗ ████████╗ ██████╗ ██████╗
  ██╔══██╗██╔══██╗██╔══██╗╚══██╔══╝██╔═══██╗██╔══██╗
  ██████╔╝███████║██████╔╝   ██║   ██║   ██║██████╔╝
  ██╔══██╗██╔══██║██╔═══╝    ██║   ██║   ██║██╔══██╗
  ██║  ██║██║  ██║██║        ██║   ╚██████╔╝██║  ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝        ╚═╝    ╚═════╝ ╚═╝  ╚═╝
BANNER
  echo -e "${RESET}"
  echo -e "  ${BOLD}Ford Raptor Build Tracker — Uninstaller${RESET}"
  echo -e "  ${DIM}Log: ${LOG_FILE}${RESET}"
  echo ""

  load_state
  confirm_uninstall

  stop_pm2
  remove_pm2_systemd
  remove_webserver_config
  remove_app_files
  remove_data_dir
  remove_log_dir
  remove_service_user
  remove_state_file
  print_summary
}

main "$@"
