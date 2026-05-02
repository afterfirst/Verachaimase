# Security Specification - Kotoba Study

## Data Invariants
1. A history item must belong to a valid user.
2. Users can only read and write their own profile and history.
3. System-generated tokens must be preserved (though in this case tokens are created by the client/AI).

## The Dirty Dozen Payloads (Rejection Targets)
1. **Identity Spoofing**: Attempt to create a history item with another user's UID.
2. **PII Leak**: Attempt to read all users' profiles.
3. **Ghost Update**: Update a history item's `userId` field to a different value.
4. **Invalid Tokens**: Save a history item with a tokens array exceeding 1000 items (resource exhaustion).
5. **ID Poisoning**: Use a 2KB string as a document ID.
6. **Malicious Tokens**: Inject raw HTML scripts into the `originalText` field.
7. **Bypass Verification**: Write as a user with `email_verified: false`.
8. **Orphaned Writes**: Create history without an existing user profile record.
9. **Timestamp Manipulation**: Set `createdAt` to a date in the future.
10. **State Corruption**: Delete someone else's history.
11. **Massive Payload**: A history item with an `originalText` string exceeding 5000 characters.
12. **System Field Injection**: Attempt to overwrite `createdAt` on update.
