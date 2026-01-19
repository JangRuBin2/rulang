// Rulang Example: Order State Machine

// Define state machine
state Order {
  CREATED
  PAID
  READY
  SHIPPED
  DONE
}

// Define transitions
transition Order {
  CREATED -> PAID when payment.success
  PAID -> READY when stock.available
  READY -> SHIPPED when delivery.pickup
  SHIPPED -> DONE when delivery.complete
}

// Create instance
let order = Order.new()
print("Initial state:")
print(order.state)

// Apply events
print("\nApplying payment.success...")
order.apply("payment.success")
print(order.state)

print("\nApplying stock.available...")
order.apply("stock.available")
print(order.state)

print("\nApplying delivery.pickup...")
order.apply("delivery.pickup")
print(order.state)

// Check history
print("\nOrder history:")
print(order.history)

// Rollback demo
print("\nRolling back...")
let prev = order.rollback()
print("Rolled back to: " + prev)
print("Current state: " + order.state)
