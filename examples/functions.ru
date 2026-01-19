// Rulang Example: Functions and Recursion

// Simple function
fn greet(name) {
  print("Hello, " + name + "!")
}

greet("Rulang")
// Recursive factorial
fn factorial(n) {
  if (n <= 1) {
    return 1
  }
  return n * factorial(n - 1)
}

print("\nFactorial examples:")
print("5! = " + factorial(5))
print("10! = " + factorial(10))

// Fibonacci
fn fib(n) {
  if (n <= 1) {
    return n
  }
  return fib(n - 1) + fib(n - 2)
}

print("\nFibonacci sequence:")
print("fib(10) = " + fib(10))

// Higher-order function simulation with state
state Counter {
  ZERO
  ONE
  TWO
  THREE
  MANY
}

transition Counter {
  ZERO -> ONE when increment
  ONE -> TWO when increment
  TWO -> THREE when increment
  THREE -> MANY when increment
}

let counter = Counter.new()
print("\nCounter demo:")
print(counter.state)
counter.apply("increment")
print(counter.state)
counter.apply("increment")
print(counter.state)
