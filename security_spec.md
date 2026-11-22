# TERRA Track Rider — Firestore Security Specification

## 1. Data Invariants
1. **Default Deny**: All unmatched paths are explicitly denied for read and write.
2. **No Public Access**: Unauthenticated clients cannot read or write any collection (`pothole_events`, `potholes`, `devices`, `alerts`, `users`, `admins`).
3. **Rider Read-Only on Backend Telemetry**: Authenticated riders can read (`get`/`list`) road safety records (`pothole_events`, `potholes`, `devices`, `alerts`) only when documents match expected rider-visible schemas, and CANNOT create, update, or delete IoT backend records. Backend ingestion occurs exclusively via the existing Node.js backend (Admin SDK) or verified admins.
4. **PII Isolation (`users/{userId}`)**: Rider profile documents are strictly isolated to `request.auth.uid == userId` or verified admins. No cross-user reads or list scraping is permitted.
5. **No Self-Assigned Privileges**: Riders can only register with `role == 'rider'` and cannot escalate `role` or write to `/admins/{adminId}`.
6. **Strict Payload & Path Validation**: All document IDs are guarded with `isValidId()`, all strings enforce `.size()` bounds synchronized with `firebase-blueprint.json`, and all writes enforce `hasAll`/`hasOnly` and `affectedKeys().hasOnly()`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. Unauthenticated read on `/pothole_events/EVT-001`.
2. Unauthenticated list query on `/pothole_events`.
3. Rider attempting to `create` a forged pothole record in `/pothole_events/FAKE-001`.
4. Rider attempting to `update` `verified: true` or `repairStatus: 'REPAIRED'` on `/pothole_events/EVT-001`.
5. Rider attempting to `delete` `/pothole_events/EVT-001`.
6. Rider attempting to `create` a device record in `/devices/ESP32-FAKE`.
7. Rider attempting to `read` another user's profile at `/users/other-rider-uid`.
8. Rider attempting to `list` `/users` to scrape rider PII.
9. Rider attempting privilege escalation by writing `role: 'admin'` in `/users/{ownUid}`.
10. Rider injecting a shadow field (`isAdmin: true`) into `/users/{ownUid}`.
11. Rider attempting to poison a document ID with a 300-character string or illegal characters (`../admin`).
12. Unverified-email admin spoof (`email == adminEmail` with `email_verified == false`) attempting to write `/pothole_events/SPOOF-1`.
