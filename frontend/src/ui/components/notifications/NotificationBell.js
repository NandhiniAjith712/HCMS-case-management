import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../context/NotificationContext';
import NotificationDropdown from './NotificationDropdown';
import './NotificationBell.css';

function badgeLabel(count) {
  if (count <= 0) return null;
  if (count > 9) return '9+';
  return String(count);
}

const NotificationBell = () => {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  const close = useCallback(() => {
    setOpen(false);
    setShowAll(false);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        close();
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (!next) setShowAll(false);
      return next;
    });
  };

  const handleItemClick = async (id) => {
    const n = notifications.find((x) => x.id === id);
    await markRead(id);
    if (n?.href) {
      navigate(n.href);
      close();
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
  };

  const handleViewAll = () => {
    setShowAll((s) => !s);
  };

  const label = badgeLabel(unreadCount);

  return (
    <div className="nb-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`nb-bell${open ? ' nb-bell--open' : ''}`}
        aria-label={open ? 'Close notifications' : 'Open notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <svg
          className="nb-bell__svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {label ? (
          <span className="nb-badge" aria-label={`${unreadCount} unread`}>
            {label}
          </span>
        ) : null}
      </button>

      {open ? (
        <NotificationDropdown
          notifications={notifications}
          onItemClick={handleItemClick}
          onMarkAllRead={handleMarkAllRead}
          onViewAll={handleViewAll}
          showAll={showAll}
        />
      ) : null}
    </div>
  );
};

export default NotificationBell;
