- On sequence diagram need Operations Summary, as Table: 
  - Redis Keys (Key pattern, Purpose, TTL)
  - Kafka Topics (Topic, Producer, Consumer)
  - Database Tables (Database, Table, Operation, Key Fields)
  - Lock Patterns (Lock Key, Type, TTL, On Failure)
  - State machine (states, workflow)
  - API endpoint Index (HTTP Calls + Events) (#ID,Caller,Callee,Method + Path,Contract File)
- On sequence diagram: reuse by using `ref` with name and short description of diagram
  - example embedded:
  ```
  ref over SUB, CSH, ORD, PE, PGW, PSP, EB, FUL, GA
    **SD-W17: Subscription Registration (Sub-Flows 2–3)**
    [5] Subscription → Cashier.ConfirmPayment(isTransSubscription=true)
    [6] Cashier → Order.CreateOrder → Inventory.createAppTransID
    [7] Cashier → PE.CreatePaymentIntent → PG → PSP quick_pay
    [8] PSP IPN → PG → PE → PaymentSuccess → Order PAID → OrderPaid
    [9] Fulfillment delivers → DeliverySuccess
    [10] Subscription consumes delivery_result
  end ref
  ```


  
Help me audit this plugin, first /audit-plugin then audit, evaluate and review file-by-file. My expect each files clean, short, smart and apply current user constrains / rules for this plugin, but generate html for me review first. Special review on what need load on static, runtime, on-demand context, to reduce context load, which skills, agents not need to automate trigger by Claude Code, but manual by plugin. Export as HTML for review and feedback