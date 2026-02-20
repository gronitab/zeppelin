.PHONY: build run dev clean

# Build the single binary with embedded frontend.
build:
	go build -o bin/zeppelin ./cmd/zeppelin

# Run the server.
run: build
	./bin/zeppelin

# Run directly without building binary.
dev:
	go run ./cmd/zeppelin

# Clean build artifacts.
clean:
	rm -rf bin/
