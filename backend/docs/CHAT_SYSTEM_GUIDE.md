# Chat System Guide

## Overview

The chat system has been completely redesigned and improved to provide a robust, real-time communication platform for the ticketing system. It now includes WebSocket support for real-time messaging, better error handling, and improved user experience.

## Features

### ✅ Real-time Messaging
- WebSocket-based real-time communication
- Instant message delivery
- Typing indicators
- Connection status monitoring

### ✅ Robust Error Handling
- Comprehensive validation
- Graceful error recovery
- User-friendly error messages
- Automatic reconnection

### ✅ Database Integration
- Dedicated chat tables
- Message persistence
- Session management
- Read status tracking

### ✅ User Experience
- Modern UI with animations
- Responsive design
- Loading states
- Connection indicators

## Database Schema

### chat_messages Table
```sql
CREATE TABLE chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  sender_type ENUM('agent', 'customer', 'system') NOT NULL,
  sender_id INT NULL,
  sender_name VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  message_type ENUM('text', 'system', 'status_update', 'typing_indicator') DEFAULT 'text',
  is_read BOOLEAN DEFAULT FALSE,
  read_at DATETIME NULL,
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at DATETIME NULL,
  parent_message_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (parent_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL
);
```

### chat_sessions Table
```sql
CREATE TABLE chat_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  session_id VARCHAR(100) UNIQUE NOT NULL,
  agent_id INT NULL,
  customer_id INT NULL,
  status ENUM('active', 'paused', 'closed') DEFAULT 'active',
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL
);
```

### chat_participants Table
```sql
CREATE TABLE chat_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(100) NOT NULL,
  user_id INT NULL,
  user_type ENUM('agent', 'customer') NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME NULL,
  is_typing BOOLEAN DEFAULT FALSE,
  last_typing_at DATETIME NULL,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

## API Endpoints

### GET /api/chat/messages/:ticketId
Get all chat messages for a specific ticket.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "ticket_id": 1,
      "sender_type": "agent",
      "sender_id": 1,
      "sender_name": "Agent Smith",
      "message": "Hello! How can I help you?",
      "message_type": "text",
      "is_read": false,
      "read_at": null,
      "is_edited": false,
      "edited_at": null,
      "parent_message_id": null,
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "ticket": {
    "id": 1,
    "name": "John Doe",
    "issue_title": "Technical Issue"
  }
}
```

### POST /api/chat/messages
Add a new chat message.

**Request Body:**
```json
{
  "ticketId": 1,
  "senderType": "agent",
  "senderId": 1,
  "senderName": "Agent Smith",
  "message": "Hello! How can I help you?",
  "messageType": "text",
  "parentMessageId": null
}
```

**Response:**
```json
{
  "success": true,
  "message": "Chat message added successfully",
  "data": {
    "id": 1,
    "ticket_id": 1,
    "sender_type": "agent",
    "sender_name": "Agent Smith",
    "message": "Hello! How can I help you?",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### PUT /api/chat/messages/read/:ticketId
Mark messages as read for a specific user.

**Request Body:**
```json
{
  "userId": 1,
  "userType": "agent"
}
```

### GET /api/chat/unread/:ticketId/:userType
Get unread message count for a user.

**Response:**
```json
{
  "success": true,
  "data": {
    "unreadCount": 5
  }
}
```

### POST /api/chat/session
Create or join a chat session.

**Request Body:**
```json
{
  "ticketId": 1,
  "userId": 1,
  "userType": "agent",
  "userName": "Agent Smith"
}
```

### PUT /api/chat/typing
Update typing status.

**Request Body:**
```json
{
  "sessionId": "session_1_1234567890",
  "userId": 1,
  "userType": "agent",
  "isTyping": true
}
```

## WebSocket Events

### Client to Server

#### JOIN_TICKET
Join a ticket chat room.
```json
{
  "type": "JOIN_TICKET",
  "ticketId": 1,
  "userId": 1,
  "userType": "agent"
}
```

#### SEND_MESSAGE
Send a new message.
```json
{
  "type": "SEND_MESSAGE",
  "ticketId": 1,
  "message": "Hello! How can I help you?",
  "userType": "agent",
  "agentName": "Agent Smith",
  "customerName": null
}
```

#### TYPING
Indicate that user is typing.
```json
{
  "type": "TYPING",
  "ticketId": 1,
  "userType": "agent",
  "agentName": "Agent Smith"
}
```

#### STOP_TYPING
Indicate that user stopped typing.
```json
{
  "type": "STOP_TYPING",
  "ticketId": 1,
  "userType": "agent"
}
```

### Server to Client

#### JOINED_ROOM
Confirmation that user joined the room.
```json
{
  "type": "JOINED_ROOM",
  "ticketId": 1,
  "userType": "agent",
  "message": "Joined ticket 1 chat room"
}
```

#### NEW_MESSAGE
New message received.
```json
{
  "type": "NEW_MESSAGE",
  "ticketId": 1,
  "message": "Hello! How can I help you?",
  "userType": "agent",
  "agentName": "Agent Smith",
  "customerName": null,
  "messageId": 1,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### USER_TYPING
User is typing indicator.
```json
{
  "type": "USER_TYPING",
  "ticketId": 1,
  "userType": "agent",
  "agentName": "Agent Smith"
}
```

#### USER_STOPPED_TYPING
User stopped typing indicator.
```json
{
  "type": "USER_STOPPED_TYPING",
  "ticketId": 1,
  "userType": "agent"
}
```

#### ERROR
Error message.
```json
{
  "type": "ERROR",
  "message": "Invalid message format",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Frontend Integration

### TicketChat Component
The main chat component that handles both REST API and WebSocket communication.

**Props:**
- `ticket`: The ticket object
- `onClose`: Function to close the chat
- `onReplyAdded`: Callback when a reply is added
- `user`: Current user object
- `userType`: User type ('agent' or 'customer')

**Features:**
- Real-time messaging via WebSocket
- Fallback to REST API if WebSocket fails
- Typing indicators
- Connection status
- Error handling and retry
- Message animations
- Responsive design

### Usage Example
```jsx
import TicketChat from './components/TicketChat';

function TicketDetail({ ticket, user }) {
  const [showChat, setShowChat] = useState(false);

  return (
    <div>
      <button onClick={() => setShowChat(true)}>
        Open Chat
      </button>
      
      {showChat && (
        <TicketChat
          ticket={ticket}
          user={user}
          userType="agent"
          onClose={() => setShowChat(false)}
          onReplyAdded={() => {
            // Refresh ticket list or update UI
          }}
        />
      )}
    </div>
  );
}
```

## Testing

### Run Chat System Test
```bash
cd backend
node test-chat-system.js
```

This will test all chat endpoints and provide detailed feedback.

### Manual Testing
1. Start the backend server
2. Start the frontend application
3. Create a ticket
4. Open the chat interface
5. Test real-time messaging between different users

## Error Handling

### Common Errors and Solutions

#### Database Connection Issues
- Check database configuration in `config.env`
- Ensure MySQL server is running
- Verify database tables exist

#### WebSocket Connection Issues
- Check if WebSocket server is running
- Verify WebSocket URL configuration
- Check firewall settings

#### Message Sending Failures
- Validate message format
- Check user permissions
- Verify ticket exists

## Performance Considerations

### Database Optimization
- Indexes on frequently queried columns
- Connection pooling
- Query optimization

### WebSocket Optimization
- Connection pooling
- Message batching
- Heartbeat monitoring

### Frontend Optimization
- Message pagination
- Lazy loading
- Debounced typing indicators

## Security

### Input Validation
- All inputs are validated server-side
- SQL injection prevention
- XSS protection

### Authentication
- User session validation
- Permission checking
- Secure WebSocket connections

## Troubleshooting

### Chat Not Loading
1. Check browser console for errors
2. Verify API endpoints are accessible
3. Check database connection
4. Ensure WebSocket server is running

### Messages Not Sending
1. Check WebSocket connection status
2. Verify user permissions
3. Check message validation
4. Review server logs

### Real-time Not Working
1. Check WebSocket server status
2. Verify client connection
3. Check network connectivity
4. Review WebSocket logs

## Future Enhancements

### Planned Features
- File attachments
- Message reactions
- Message editing
- Message deletion
- Read receipts
- Message search
- Chat history export
- Voice messages
- Video calls integration

### Performance Improvements
- Message caching
- Pagination optimization
- Real-time notifications
- Offline message queuing

## Support

For issues or questions about the chat system:
1. Check this documentation
2. Review server logs
3. Run the test script
4. Contact the development team

---

**Last Updated:** January 2024
**Version:** 2.0.0 