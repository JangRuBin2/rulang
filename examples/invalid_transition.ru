// Rulang Example: Invalid Transition Error

state Order {
  CREATED
  PAID
  SHIPPED
}

transition Order {
  CREATED -> PAID when payment.success
  PAID -> SHIPPED when delivery.pickup
}

let order = Order.new()
print("Current state: " + order.state)

// This should fail - can't go directly from CREATED to SHIPPED
print("\nTrying invalid transition...")
order.apply("delivery.pickup")
