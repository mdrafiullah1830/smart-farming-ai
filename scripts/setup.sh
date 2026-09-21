#!/bin/bash
# Smart Farming AI Platform - Setup Script
# Bangladesh Agricultural Intelligence System

set -e

echo "========================================="
echo " Smart Farming AI Platform - Setup"
echo " Bangladesh Agricultural Intelligence"
echo "========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check prerequisites
check_prerequisites() {
    echo -e "\n${YELLOW}Checking prerequisites...${NC}"

    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}Python 3 not found. Please install Python 3.12+${NC}"
        exit 1
    fi

    if ! command -v flutter &> /dev/null; then
        echo -e "${RED}Flutter not found. Please install Flutter 3.16+${NC}"
        exit 1
    fi

    if ! command -v docker &> /dev/null; then
        echo -e "${YELLOW}Docker not found. Some features may not work.${NC}"
    fi

    echo -e "${GREEN}Prerequisites check passed!${NC}"
}

# Setup backend
setup_backend() {
    echo -e "\n${YELLOW}Setting up backend...${NC}"

    pushd backend > /dev/null

    # Create virtual environment
    python3 -m venv venv
    source venv/bin/activate

    # Install dependencies
    pip install --upgrade pip
    pip install -r requirements.txt

    # Setup environment
    if [ ! -f .env ]; then
        cp .env.example .env
        echo -e "${YELLOW}Created .env file. Please edit with your API keys.${NC}"
    fi

    popd > /dev/null
    echo -e "${GREEN}Backend setup complete!${NC}"
}

# Setup database
setup_database() {
    echo -e "\n${YELLOW}Setting up database...${NC}"

    if command -v psql &> /dev/null; then
        psql -U postgres -c "CREATE DATABASE smart_farming_db;" 2>/dev/null || true
        psql -U postgres -d smart_farming_db -f database/schema.sql
        psql -U postgres -d smart_farming_db -f database/seeds/seed_data.sql
        echo -e "${GREEN}Database setup complete!${NC}"
    else
        echo -e "${YELLOW}PostgreSQL not found. Using Docker...${NC}"
        docker-compose up -d postgres
        sleep 5
        docker exec -i smart_farming_postgres psql -U smartfarming -d smart_farming_db < database/schema.sql
        docker exec -i smart_farming_postgres psql -U smartfarming -d smart_farming_db < database/seeds/seed_data.sql
        echo -e "${GREEN}Database setup complete via Docker!${NC}"
    fi
}

# Train AI models
train_models() {
    echo -e "\n${YELLOW}Training AI models...${NC}"

    ROOT_DIR="$(pwd)"
    mkdir -p ai_models/trained_models

    echo "Training crop recommendation model..."
    python3 ai_models/crop_prediction/train.py

    echo "Training yield prediction model..."
    python3 ai_models/yield_prediction/train.py

    echo "Training market forecasting model..."
    python3 ai_models/market_forecasting/train.py

    echo "Training disease detection model..."
    python3 ai_models/disease_detection/train.py

    echo -e "${GREEN}AI models trained!${NC}"
}

# Setup Flutter app
setup_flutter() {
    echo -e "\n${YELLOW}Setting up Flutter app...${NC}"

    pushd frontend > /dev/null
    flutter pub get
    popd > /dev/null

    echo -e "${GREEN}Flutter app setup complete!${NC}"
}

# Start services
start_services() {
    echo -e "\n${YELLOW}Starting services...${NC}"

    docker-compose up -d

    echo -e "${GREEN}Services started!${NC}"
    echo "Backend: http://localhost:8000"
    echo "API Docs: http://localhost:8000/docs"
    echo "Database: localhost:5432"
    echo "Redis: localhost:6379"
}

# Run tests
run_tests() {
    echo -e "\n${YELLOW}Running tests...${NC}"

    if [ -d tests/backend ]; then
        pushd tests/backend > /dev/null
        python3 -m pytest -v
        popd > /dev/null
    fi

    if [ -d tests/ai_models ]; then
        pushd tests/ai_models > /dev/null
        python3 -m pytest -v
        popd > /dev/null
    fi

    echo -e "${GREEN}Tests complete!${NC}"
}

# Main
main() {
    case "${1:-setup}" in
        setup)
            check_prerequisites
            setup_backend
            setup_database
            train_models
            setup_flutter
            echo -e "\n${GREEN}Setup complete!${NC}"
            echo "Run: docker-compose up -d to start services"
            echo "Run: cd frontend && flutter run for mobile app"
            ;;
        backend)
            setup_backend
            ;;
        database)
            setup_database
            ;;
        models)
            train_models
            ;;
        flutter)
            setup_flutter
            ;;
        start)
            start_services
            ;;
        test)
            run_tests
            ;;
        *)
            echo "Usage: $0 {setup|backend|database|models|flutter|start|test}"
            ;;
    esac
}

main "$@"
