# Case Statuses

HCMS uses the following case statuses:

- **Open / New**: the case has been created but not yet picked up by HR.
- **In Progress**: HR is actively working on the case.
- **Resolved**: the case has been resolved by HR and is waiting for employee confirmation.
- **Closed**: the case is complete. The employee has confirmed satisfaction and closed it.
- **Escalated**: the case has been moved to a higher escalation level because it could not be resolved at the current level.
- **Waiting**: the case is waiting for additional information or action from the employee or another party.
- **Rejected**: the case was not accepted or is outside the scope of HCMS.

Note: the backend database may store some statuses with slightly different names (e.g., `new` for open), but the employee-facing terminology is as listed above.
