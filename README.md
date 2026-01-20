# Rulang

**API 서버 개발에 특화된 도메인 특화 프로그래밍 언어**

Rulang은 REST API 서버 개발을 위해 설계된 도메인 특화 언어(DSL)입니다. 상태 머신을 1급 시민으로 지원하여, 주문 처리, 워크플로우 관리 등 상태 기반 비즈니스 로직을 간결하고 안전하게 표현할 수 있습니다.

## 특징

- **선언적 API 정의**: `endpoint` 키워드로 REST 엔드포인트를 직관적으로 정의
- **내장 상태 머신**: `state`와 `transition`으로 복잡한 상태 전이 로직을 안전하게 관리
- **미들웨어 시스템**: 인증, 로깅 등의 공통 로직을 재사용 가능한 미들웨어로 분리
- **요청 검증**: `validate` 구문으로 요청 데이터의 타입과 필수 필드를 검증
- **내장 데이터베이스**: 간단한 CRUD 작업을 위한 인메모리 데이터베이스 제공

## 설치

```bash
# 프로젝트 클론
git clone <repository-url>
cd rulang

# 의존성 설치
npm install

# 빌드
npm run build
```

## 빠른 시작

### Hello World API

```ru
// hello.ru
endpoint GET "/hello" {
    res.json({ message: "Hello, Rulang!" })
}

server 3000
```

실행:
```bash
npm start hello.ru
```

테스트:
```bash
curl http://localhost:3000/hello
# {"message":"Hello, Rulang!"}
```

## 문법 가이드

### 1. 엔드포인트 정의

```ru
// GET 요청
endpoint GET "/users" {
    let users = db.find("users", {})
    res.json(users)
}

// URL 파라미터
endpoint GET "/users/:id" {
    let user = db.findOne("users", { id: req.params.id })
    res.json(user)
}

// POST 요청
endpoint POST "/users" {
    let newUser = db.insert("users", req.body)
    res.status(201).json(newUser)
}

// 미들웨어 적용
endpoint PUT "/users/:id" use [auth] {
    // auth 미들웨어가 먼저 실행됨
    db.update("users", { id: req.params.id }, req.body)
    res.json({ success: true })
}
```

지원 HTTP 메서드: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`

### 2. 요청 객체 (req)

```ru
req.method      // HTTP 메서드 ("GET", "POST", ...)
req.path        // 요청 경로 ("/users/123")
req.params      // URL 파라미터 ({ id: "123" })
req.query       // 쿼리 스트링 ({ page: "1" })
req.headers     // 요청 헤더
req.body        // 요청 본문 (JSON 파싱됨)
```

### 3. 응답 객체 (res)

```ru
res.json(data)              // JSON 응답
res.text("Hello")           // 텍스트 응답
res.status(201).json(data)  // 상태 코드와 함께 응답
res.header("X-Custom", "value")  // 헤더 설정
res.redirect("/other")      // 리다이렉트
```

### 4. 미들웨어

```ru
// 미들웨어 정의
middleware logger {
    print("[LOG] " + req.method + " " + req.path)
    next()  // 다음 미들웨어/핸들러로 진행
}

middleware auth {
    if (req.headers.authorization == null) {
        res.status(401).json({ error: "Unauthorized" })
        return  // 체인 중단
    }
    next()
}

// 전역 미들웨어 적용
use logger

// 특정 엔드포인트에 적용
endpoint GET "/admin" use [auth] {
    res.json({ secret: "data" })
}
```

### 5. 요청 검증

```ru
endpoint POST "/users" {
    validate req.body {
        name: string
        email: string
        age: optional number
        address: optional object {
            city: string
            zipcode: string
        }
    }

    // 검증 통과 후 실행
    let user = db.insert("users", req.body)
    res.json(user)
}
```

지원 타입: `string`, `number`, `boolean`, `array`, `object`

### 6. 상태 머신

```ru
// 상태 정의
state OrderStatus {
    PENDING
    CONFIRMED
    SHIPPED
    DELIVERED
    CANCELLED
}

// 전이 규칙 정의
transition OrderStatus {
    PENDING -> CONFIRMED when order.confirm
    PENDING -> CANCELLED when order.cancel
    CONFIRMED -> SHIPPED when order.ship
    SHIPPED -> DELIVERED when order.deliver
}

// 사용
let order = OrderStatus.new()
print(order.state)              // "PENDING"

order.apply("order.confirm")
print(order.state)              // "CONFIRMED"

print(order.history)            // ["PENDING", "CONFIRMED"]

order.rollback()                // 이전 상태로 롤백
print(order.state)              // "PENDING"
```

잘못된 전이 시 런타임 에러 발생:
```ru
let order = OrderStatus.new()   // PENDING
order.apply("order.ship")       // Error: Cannot apply 'order.ship' in state 'PENDING'
```

### 7. 데이터베이스 (인메모리)

```ru
// 조회
let users = db.find("users", {})
let user = db.findOne("users", { id: 123 })

// 삽입
let newUser = db.insert("users", { name: "John", email: "john@example.com" })

// 업데이트
db.update("users", { id: 123 }, { name: "Jane" })

// 삭제
db.delete("users", { id: 123 })
```

### 8. 기본 문법

```ru
// 변수
let name = "Rulang"
let age = 1
let active = true
let items = [1, 2, 3]
let user = { name: "John", age: 30 }

// 함수
fn greet(name) {
    return "Hello, " + name
}

// 조건문
if (age > 18) {
    print("Adult")
} else {
    print("Minor")
}

// 출력
print("Hello, World!")
```

## 예제

### 완전한 REST API 예제

```ru
// api.ru

// 로깅 미들웨어
middleware logger {
    print("[" + req.method + "] " + req.path)
    next()
}

use logger

// 사용자 목록
endpoint GET "/api/users" {
    let users = db.find("users", {})
    res.json({ data: users, count: users.length })
}

// 사용자 조회
endpoint GET "/api/users/:id" {
    let user = db.findOne("users", { id: req.params.id })
    if (user == null) {
        res.status(404).json({ error: "Not found" })
    } else {
        res.json(user)
    }
}

// 사용자 생성
endpoint POST "/api/users" {
    validate req.body {
        name: string
        email: string
    }
    let user = db.insert("users", req.body)
    res.status(201).json(user)
}

// 서버 시작
server 3000
```

### 주문 상태 관리 예제

```ru
// order.ru

state Order {
    CREATED, PAID, SHIPPED, DELIVERED
}

transition Order {
    CREATED -> PAID when payment.success
    PAID -> SHIPPED when ship.start
    SHIPPED -> DELIVERED when ship.complete
}

endpoint POST "/orders" {
    let order = Order.new()
    // DB에 저장하고 order id 반환
    res.status(201).json({
        id: 1,
        state: order.state
    })
}

endpoint POST "/orders/:id/pay" {
    let order = Order.new()
    order.apply("payment.success")
    res.json({ state: order.state })
}

server 3000
```

## CLI 사용법

```bash
# 파일 실행 (서버 자동 시작)
npm start <filename.ru>

# REPL 모드
npm start
>>> let x = 10
>>> print(x * 2)
20
>>> exit
```

## 프로젝트 구조

```
rulang/
├── src/
│   ├── token.ts        # 토큰 타입 정의
│   ├── lexer.ts        # 렉서 (토큰화)
│   ├── ast.ts          # AST 노드 타입
│   ├── parser.ts       # 파서
│   ├── compiler.ts     # 상태 머신 컴파일러
│   ├── interpreter.ts  # 인터프리터 & HTTP 서버
│   └── index.ts        # CLI 진입점
├── examples/
│   ├── simple_api.ru   # 간단한 API 예제
│   ├── api_server.ru   # 전체 기능 예제
│   ├── order.ru        # 상태 머신 예제
│   └── functions.ru    # 함수 예제
├── PLAN.md             # 개발 로드맵
└── README.md
```

## 로드맵

자세한 개발 계획은 [PLAN.md](./PLAN.md)를 참조하세요.

### 다음 버전 예정 기능
- [ ] 실제 데이터베이스 연동 (PostgreSQL, MongoDB)
- [ ] JWT 인증 내장
- [ ] 웹소켓 지원
- [ ] 타입 시스템
- [ ] 에러 핸들링 개선
- [ ] 환경 변수 지원

## 라이선스

ISC
