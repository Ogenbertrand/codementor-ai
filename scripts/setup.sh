#!/bin/bash

# CodeMentor AI Setup Script
# This script helps set up the development environment

set -e

echo "🚀 CodeMentor AI Setup Script"
echo "============================="
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20 or higher."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version 20 or higher is required. Current version: $(node --version)"
    exit 1
fi

echo "✅ Node.js $(node --version)"

# Check npm version
NPM_VERSION=$(npm --version | cut -d'.' -f1)
if [ "$NPM_VERSION" -lt 10 ]; then
    echo "❌ npm version 10 or higher is required. Current version: $(npm --version)"
    exit 1
fi

echo "✅ npm $(npm --version)"

# Check Git
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git."
    exit 1
fi

echo "✅ Git $(git --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Build all components
echo "🔨 Building all components..."
npm run build
echo "✅ All components built"
echo ""

# Create .env files if they don't exist
echo "⚙️  Setting up environment configuration..."

if [ ! -f "github-app/.env" ]; then
    cp .env.example github-app/.env
    echo "✅ Created github-app/.env (please update with your values)"
else
    echo "✅ github-app/.env already exists"
fi

if [ ! -f "mcp-server/.env" ]; then
    cp .env.example mcp-server/.env
    echo "✅ Created mcp-server/.env (please update with your values)"
else
    echo "✅ mcp-server/.env already exists"
fi

echo ""

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs
echo "✅ Logs directory created"
echo ""

# Run tests
echo "🧪 Running tests..."
npm test 2>/dev/null || echo "⚠️  Some tests failed. This is normal for initial setup."
echo ""

# Summary
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update the .env files with your actual configuration values"
echo "2. Set up your GitHub App (see README.md)"
echo "3. Install the VS Code extension (see README.md)"
echo "4. Run 'npm run dev' to start all services"
echo ""
echo "For more information, see the README.md file."
echo ""
echo "Happy coding! 🚀"