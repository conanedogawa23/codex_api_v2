#!/bin/bash

# PM2 Production Startup Script for Codex API v2
# This script performs pre-checks and starts the application with PM2

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Codex API v2 - PM2 Startup Script"
echo "======================================"
echo ""

# Function to print colored messages
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo "ℹ $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi
print_success "Node.js installed: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi
print_success "npm installed: $(npm --version)"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 is not installed globally. Installing PM2..."
    npm install -g pm2
    print_success "PM2 installed successfully"
fi
print_success "PM2 installed: $(pm2 --version)"

# Check if .env file exists
if [ ! -f .env ]; then
    print_error ".env file not found. Please create .env from .env.example"
    print_info "Run: cp .env.example .env"
    exit 1
fi
print_success ".env file found"

# Check if MongoDB URI is configured
if ! grep -q "MONGODB_URI=" .env; then
    print_error "MONGODB_URI not found in .env file"
    print_info "Please configure MONGODB_URI in your .env file"
    exit 1
fi
print_success "MongoDB URI configured"

# Create logs directory if it doesn't exist
mkdir -p logs/pm2
print_success "Logs directory ready"

# Install dependencies using lock file for reproducible builds
if [ ! -f "package-lock.json" ]; then
    print_error "package-lock.json not found. Cannot perform clean install."
    print_info "Ensure package-lock.json is committed to the repository."
    exit 1
fi
print_info "Installing dependencies from lock file..."
npm ci
print_success "Dependencies installed"

# Build the application
print_info "Building TypeScript..."
npm run build

if [ ! -d "dist" ]; then
    print_error "Build failed. dist/ directory not found"
    exit 1
fi
print_success "Build completed successfully"

# Get environment from argument (default: production)
ENVIRONMENT=${1:-production}
print_info "Starting with environment: $ENVIRONMENT"

# Stop existing PM2 processes (if any)
if pm2 list | grep -q "codex-api-v2"; then
    print_warning "Stopping existing PM2 processes..."
    pm2 stop ecosystem.config.js
    print_success "Existing processes stopped"
fi

# Start with PM2
print_info "Starting Codex API v2 with PM2..."
pm2 start ecosystem.config.js --env $ENVIRONMENT

# Check if processes started successfully
sleep 2
if pm2 list | grep -q "online"; then
    print_success "Codex API v2 started successfully!"
else
    print_error "Failed to start Codex API v2. Check logs with: pm2 logs"
    exit 1
fi

# Save PM2 process list
pm2 save
print_success "PM2 process list saved"

echo ""
echo "======================================"
print_success "Codex API v2 is now running with PM2"
echo "======================================"
echo ""
print_info "Useful commands:"
echo "  • View logs:       pm2 logs codex-api-v2"
echo "  • Monitor:         pm2 monit"
echo "  • Status:          pm2 status"
echo "  • Reload:          pm2 reload codex-api-v2"
echo "  • Stop:            pm2 stop codex-api-v2"
echo ""
print_info "Setup auto-start on reboot:"
echo "  • Run:             pm2 startup"
echo "  • Follow the instructions to setup startup script"
echo ""
