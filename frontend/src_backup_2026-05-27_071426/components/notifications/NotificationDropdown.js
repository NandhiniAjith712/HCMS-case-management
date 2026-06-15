import React from 'react';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

const NotificationDropdown = ({
  notifications,
  onItemClick,
  onMarkAllRead,
  onViewAll,
  showAll
}) => {
  const visible = showAll ? notifications : notifications.slice(0, 5);
  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div
      className="nb-dropdown nb-dropdown--animate"
      role="dialog"
      aria-label="Notifications"
    >
      <div className="nb-dropdown__head">
        <span className="nb-dropdown__title">Notifications</span>
        {hasUnread ? (
          <button type="button" className="nb-dropdown__link-btn" onClick={onMarkAllRead}>
            Mark all as read
          </button>
        ) : null}
      </div>

      <div className="nb-dropdown__list" role="list">
        {visible.length === 0 ? (
          <div className="nb-dropdown__empty">You&apos;re all caught up.</div>
        ) : (
          visible.map((n) => (
            <button
              key={n.id}
              type="button"
              role="listitem"
              className={`nb-dropdown__item${n.isRead ? '' : ' nb-dropdown__item--unread'}`}
              onClick={() => onItemClick(n.id)}
            >
              <span className={`nb-dropdown__accent nb-dropdown__accent--${String(n.type || 'info').replace(/[^a-z0-9_-]/gi, '_')}`} aria-hidden />
              <div className="nb-dropdown__body">
                <div className="nb-dropdown__item-title">{n.title}</div>
                <div className="nb-dropdown__item-desc">{n.description}</div>
                <div className="nb-dropdown__item-time">
                  {formatRelativeTime(n.createdAtMs || Date.now())}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      <div className="nb-dropdown__footer">
        {notifications.length > 5 ? (
          <button type="button" className="nb-dropdown__footer-link" onClick={onViewAll}>
            {showAll ? 'Show fewer' : 'View all notifications'}
          </button>
        ) : (
          <span className="nb-dropdown__footer-muted">View all notifications</span>
        )}
      </div>
    </div>
  );
};

export default NotificationDropdown;
