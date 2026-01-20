# Rulang 개발 계획서

## 현재 상태 (v0.1)

### 구현 완료
- [x] Lexer (토큰화)
- [x] Parser (AST 생성)
- [x] Compiler (상태 머신 컴파일)
- [x] Interpreter (실행)
- [x] 상태 머신 (`state`, `transition`, `when`)
- [x] 기본 문법 (`let`, `fn`, `if/else`, `return`, `print`)
- [x] 데이터 타입 (number, string, boolean, null, array, object)
- [x] 내장 객체 (`http`, `json` - 목업)
- [x] REPL 및 파일 실행

### 파일 구조
```
rulang/
├── src/
│   ├── token.ts      # 토큰 정의
│   ├── lexer.ts      # 렉서
│   ├── ast.ts        # AST 노드 타입
│   ├── parser.ts     # 파서
│   ├── compiler.ts   # 컴파일러
│   ├── interpreter.ts # 인터프리터
│   └── index.ts      # CLI 진입점
├── examples/
│   ├── order.ru      # 주문 상태 머신 예제
│   ├── functions.ru  # 함수 예제
│   └── invalid_transition.ru
└── package.json
```

---

## Phase 2: API 서버 핵심 기능

### 2.1 HTTP 엔드포인트 문법 (우선순위: 높음)

**새 키워드**: `endpoint`, `GET`, `POST`, `PUT`, `DELETE`, `PATCH`

**문법 예시**:
```ru
endpoint GET "/users" {
    let users = db.find("users", {})
    res.json(users)
}

endpoint POST "/users" {
    validate req.body {
        name: string
        email: string
    }
    let user = db.insert("users", req.body)
    res.status(201).json(user)
}

endpoint GET "/users/:id" {
    let user = db.findOne("users", { id: req.params.id })
    if (user == null) {
        res.status(404).json({ error: "Not found" })
    } else {
        res.json(user)
    }
}
```

**구현 필요 사항**:
1. `token.ts`: `ENDPOINT`, `GET`, `POST`, `PUT`, `DELETE`, `PATCH` 토큰 추가
2. `ast.ts`: `EndpointDeclaration` AST 노드 추가
3. `parser.ts`: `parseEndpointDeclaration()` 메서드 추가
4. `interpreter.ts`: 엔드포인트 등록 및 라우팅 로직

### 2.2 요청/응답 객체 (우선순위: 높음)

**내장 객체**:
- `req`: 요청 객체
  - `req.body`: 요청 본문
  - `req.params`: URL 파라미터 (`:id` 등)
  - `req.query`: 쿼리 스트링
  - `req.headers`: 헤더
  - `req.method`: HTTP 메서드
  - `req.path`: 요청 경로

- `res`: 응답 객체
  - `res.json(data)`: JSON 응답
  - `res.text(str)`: 텍스트 응답
  - `res.status(code)`: 상태 코드 설정
  - `res.header(key, value)`: 헤더 설정
  - `res.redirect(url)`: 리다이렉트

### 2.3 검증(Validation) 문법 (우선순위: 중간)

**새 키워드**: `validate`, `string`, `number`, `boolean`, `array`, `object`, `optional`, `required`

**문법 예시**:
```ru
validate req.body {
    name: string
    age: number
    email: string
    tags: array
    address: optional object {
        city: string
        zipcode: string
    }
}
```

**구현 필요 사항**:
1. `token.ts`: 타입 키워드들 추가
2. `ast.ts`: `ValidateStatement`, `ValidationSchema` 노드 추가
3. `parser.ts`: `parseValidateStatement()` 메서드 추가
4. `interpreter.ts`: 런타임 검증 로직

### 2.4 미들웨어 시스템 (우선순위: 중간)

**새 키워드**: `middleware`, `use`, `next`

**문법 예시**:
```ru
middleware auth {
    let token = req.headers.authorization
    if (token == null) {
        res.status(401).json({ error: "Unauthorized" })
        return
    }
    let user = jwt.verify(token)
    req.user = user
    next()
}

// 특정 엔드포인트에 적용
endpoint GET "/profile" use [auth] {
    res.json(req.user)
}

// 전역 미들웨어
use logger
```

---

## Phase 3: 데이터 계층

### 3.1 데이터베이스 추상화

**내장 객체**: `db`

```ru
// 기본 CRUD
let users = db.find("users", { active: true })
let user = db.findOne("users", { id: 123 })
let newUser = db.insert("users", { name: "John" })
db.update("users", { id: 123 }, { name: "Jane" })
db.delete("users", { id: 123 })

// 트랜잭션
db.transaction(fn() {
    db.update("accounts", { id: from }, { balance: balance - amount })
    db.update("accounts", { id: to }, { balance: balance + amount })
})
```

### 3.2 상태 머신과 API 통합

```ru
state Order {
    CREATED, PAID, SHIPPED, DELIVERED, CANCELLED
}

transition Order {
    CREATED -> PAID when payment.success
    CREATED -> CANCELLED when order.cancel
    PAID -> SHIPPED when shipping.start
    SHIPPED -> DELIVERED when shipping.complete
}

endpoint POST "/orders/:id/pay" {
    let order = db.findOne("orders", { id: req.params.id })

    // 상태 머신 자동 검증
    order.state.apply("payment.success")

    db.update("orders", { id: req.params.id }, { state: order.state.current })
    res.json(order)
}
```

---

## Phase 4: 고급 기능

### 4.1 에러 핸들링

```ru
try {
    let result = risky_operation()
} catch (e) {
    res.status(500).json({ error: e.message })
}

// 전역 에러 핸들러
on error {
    log.error(error)
    res.status(500).json({ error: "Internal Server Error" })
}
```

### 4.2 환경 설정

```ru
config {
    port: 3000
    database: {
        host: env.DB_HOST
        port: env.DB_PORT
    }
}
```

### 4.3 타입 시스템 (선택적)

```ru
type User {
    id: number
    name: string
    email: string
    createdAt: datetime
}

endpoint GET "/users/:id" -> User {
    return db.findOne("users", { id: req.params.id })
}
```

---

## 구현 순서

### Sprint 1 (완료)
1. [x] 기본 언어 기능
2. [x] HTTP 엔드포인트 문법
3. [x] 요청/응답 객체
4. [x] 기본 라우팅

### Sprint 2 (완료)
1. [x] 검증(Validation)
2. [x] 미들웨어 시스템
3. [ ] 에러 핸들링 (try/catch)

### Sprint 3 (진행 중)
1. [x] 데이터베이스 추상화 (인메모리)
2. [x] 상태 머신-API 통합
3. [ ] 트랜잭션 지원
4. [ ] 실제 DB 연동 (PostgreSQL, MongoDB)

### Sprint 4 (예정)
1. [ ] 환경 설정 (env 변수)
2. [ ] 타입 시스템
3. [x] 문서화 및 예제

---

## 코드 변경 가이드

### 새 토큰 추가 시
1. `token.ts`의 `TokenType` enum에 토큰 추가
2. 키워드면 `KEYWORDS` 객체에 추가
3. 연산자면 `lexer.ts`의 `scanOperator()`에 추가

### 새 문법 추가 시
1. `ast.ts`에 AST 노드 인터페이스 추가
2. `parser.ts`에 파싱 메서드 추가
3. `parseStatement()` 또는 `parseExpression()`에서 호출

### 런타임 기능 추가 시
1. `interpreter.ts`에 실행 로직 추가
2. 내장 함수면 `setupGlobals()`에 등록
3. 새 값 타입이면 `RuValue` union에 추가

---

## 다음 작업 시 체크리스트

1. 이 PLAN.md 확인
2. 현재 Sprint 확인
3. 구현 순서에 따라 작업
4. 예제 파일로 테스트
5. PLAN.md 업데이트
