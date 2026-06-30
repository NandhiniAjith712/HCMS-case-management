# Case Lifecycle

The typical lifecycle of an employee case in HCMS is:

1. **Created**: the employee submits the case. Status becomes `open` (stored as `new` in the backend).
2. **Assigned**: the case is routed to the appropriate HR team or assigned to suitable people based on its category and type.
3. **In Progress**: HR is actively working on the case.
4. **Resolved**: HR marks the case as resolved. The employee is asked to confirm satisfaction.
5. **Closed**: the employee confirms the resolution and closes the case. The case can also be closed by HR if configured.
6. **Reopened**: if the employee is not satisfied, they can reopen the case and provide a reason.
7. **Escalated**: if the case cannot be resolved at the current level, it may be escalated to a higher level (L2 to L5).
8. **Rejected**: if the request is invalid or out of scope, HR may reject it.

Employees can close their own cases and reopen them. The case history shows every status change, assignment, and comment.
