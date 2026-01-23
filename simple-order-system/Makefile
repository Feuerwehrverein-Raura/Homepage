.PHONY: help build up down logs clean restart status

help:
	@echo "Simple Order System - Make Commands"
	@echo ""
	@echo "make build         - Build all Docker images"
	@echo "make up            - Start all services"
	@echo "make down          - Stop all services"
	@echo "make logs          - Show logs (follow)"
	@echo "make restart       - Restart all services"
	@echo "make clean         - Remove all containers and volumes"
	@echo "make status        - Show container status"
	@echo "make backend-logs  - Show backend logs"
	@echo "make frontend-logs - Show frontend logs"
	@echo "make kitchen-logs  - Show kitchen display logs"
	@echo "make db-shell      - Open PostgreSQL shell"

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

restart:
	docker-compose restart

clean:
	docker-compose down -v
	docker system prune -f

status:
	docker-compose ps

backend-logs:
	docker-compose logs -f backend

frontend-logs:
	docker-compose logs -f frontend

kitchen-logs:
	docker-compose logs -f kitchen-display

db-shell:
	docker-compose exec postgres psql -U orderuser -d orderdb
