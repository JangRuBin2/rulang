// Rulang Example: REST API Server
// Run with: npm start examples/api_server.ru

// ============ Middleware Definitions ============

middleware logger {
    print("[LOG] " + req.method + " " + req.path)
    next()
}

middleware auth {
    let token = req.headers.authorization
    if (token == null) {
        res.status(401).json({ error: "Unauthorized", message: "Missing authorization header" })
        return
    }
    // In real app, verify JWT token here
    print("[AUTH] Token verified")
    next()
}

// ============ Global Middleware ============

use logger

// ============ User Endpoints ============

// GET /users - List all users
endpoint GET "/users" {
    let users = db.find("users", {})
    res.json({
        success: true,
        data: users,
        count: users.length
    })
}

// GET /users/:id - Get single user
endpoint GET "/users/:id" {
    let userId = req.params.id
    let user = db.findOne("users", { id: userId })

    if (user == null) {
        res.status(404).json({
            success: false,
            error: "User not found"
        })
    } else {
        res.json({
            success: true,
            data: user
        })
    }
}

// POST /users - Create new user
endpoint POST "/users" {
    validate req.body {
        name: string
        email: string
        age: optional number
    }

    let newUser = db.insert("users", req.body)
    res.status(201).json({
        success: true,
        message: "User created",
        data: newUser
    })
}

// PUT /users/:id - Update user (protected)
endpoint PUT "/users/:id" use [auth] {
    let userId = req.params.id
    let existing = db.findOne("users", { id: userId })

    if (existing == null) {
        res.status(404).json({
            success: false,
            error: "User not found"
        })
        return
    }

    let updated = db.update("users", { id: userId }, req.body)
    res.json({
        success: true,
        message: "User updated",
        count: updated
    })
}

// DELETE /users/:id - Delete user (protected)
endpoint DELETE "/users/:id" use [auth] {
    let userId = req.params.id
    let deleted = db.delete("users", { id: userId })

    if (deleted == 0) {
        res.status(404).json({
            success: false,
            error: "User not found"
        })
    } else {
        res.json({
            success: true,
            message: "User deleted"
        })
    }
}

// ============ Order State Machine Integration ============

state OrderStatus {
    PENDING
    CONFIRMED
    SHIPPED
    DELIVERED
    CANCELLED
}

transition OrderStatus {
    PENDING -> CONFIRMED when order.confirm
    PENDING -> CANCELLED when order.cancel
    CONFIRMED -> SHIPPED when order.ship
    SHIPPED -> DELIVERED when order.deliver
}

// GET /orders/:id/status - Get order status
endpoint GET "/orders/:id/status" {
    // In real app, fetch from DB
    let order = OrderStatus.new()

    res.json({
        orderId: req.params.id,
        currentState: order.state,
        history: order.history
    })
}

// POST /orders/:id/transition - Apply state transition
endpoint POST "/orders/:id/transition" use [auth] {
    validate req.body {
        event: string
    }

    let order = OrderStatus.new()

    // Simulate state by applying multiple events
    // In real app, load from DB
    order.apply(req.body.event)

    res.json({
        success: true,
        orderId: req.params.id,
        newState: order.state,
        history: order.history
    })
}

// ============ Health Check ============

endpoint GET "/health" {
    res.json({
        status: "healthy",
        version: "1.0.0",
        timestamp: 1234567890
    })
}

// ============ Server Configuration ============

server 3000

print("API Server starting...")
print("Endpoints:")
print("  GET  /health")
print("  GET  /users")
print("  GET  /users/:id")
print("  POST /users")
print("  PUT  /users/:id (auth required)")
print("  DELETE /users/:id (auth required)")
print("  GET  /orders/:id/status")
print("  POST /orders/:id/transition (auth required)")
