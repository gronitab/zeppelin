package sse

import (
	"testing"
)

func TestNewBroker(t *testing.T) {
	b := NewBroker()
	if b.ClientCount() != 0 {
		t.Errorf("expected 0 clients, got %d", b.ClientCount())
	}
}

func TestBroadcastNoClients(t *testing.T) {
	b := NewBroker()
	// Should not panic with no clients.
	b.Broadcast(map[string]string{"type": "test"})
}

func TestClientManagement(t *testing.T) {
	b := NewBroker()

	ch := make(chan []byte, 64)
	b.addClient(ch)
	if b.ClientCount() != 1 {
		t.Errorf("expected 1 client, got %d", b.ClientCount())
	}

	b.removeClient(ch)
	if b.ClientCount() != 0 {
		t.Errorf("expected 0 clients after remove, got %d", b.ClientCount())
	}
}

func TestBroadcastToClient(t *testing.T) {
	b := NewBroker()

	ch := make(chan []byte, 64)
	b.addClient(ch)
	defer b.removeClient(ch)

	b.Broadcast(map[string]string{"type": "test"})

	select {
	case data := <-ch:
		if len(data) == 0 {
			t.Error("expected non-empty data")
		}
	default:
		t.Error("expected data on channel")
	}
}
