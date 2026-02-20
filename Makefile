.PHONY: build run dev dev-frontend clean frontend

# Build the frontend with Vite.
frontend:
	cd frontend && npm run build

# Build the single binary with embedded frontend.
build: frontend
	go build -o bin/zeppelin ./cmd/zeppelin

# Run the server.
run: build
	./bin/zeppelin

# Run Go backend in dev mode (uses existing frontend/dist).
dev:
	go run ./cmd/zeppelin

# Run Vite dev server with HMR (proxy to Go backend).
dev-frontend:
	cd frontend && npm run dev

# Clean build artifacts.
clean:
	rm -rf bin/ frontend/dist/
