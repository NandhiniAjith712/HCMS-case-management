# User Redirection URL Format

## Standard Format

```
{base_url}/{product}?m={module_name}&u={user_name}&e={email_id}
```

- **Product** is in the path only (not repeated in query string)
- **e** = email (unique user identifier, required)
- **u** = user name (optional)
- **m** = module name (optional)

## Examples

### Support entry
```
http://localhost:3000/GRC?m=&u=John&e=user%40example.com
https://itsm.vardands.com/GRC?m=VOC&u=Jane&e=jane%40company.com
```

### Customer chat (ticket link from email)
```
http://localhost:3000/chat/1234?m=&u=John&e=user%40example.com
```

### Testing
```
http://localhost:3000/GRC?m=&e=test%40example.com
```

## Backward Compatibility

The platform accepts legacy parameters for a transition period:
- `user_email` → `e`
- `user_name` → `u`

## Usage

- **Internal testing**: Use the format above with existing database users
- **Manual testing**: Build URLs with `e` (required), `u` and `m` (optional)
- **External app redirection**: Use this format for all redirects to ITSM
