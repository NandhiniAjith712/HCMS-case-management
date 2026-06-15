import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders } from '../../utils/api';
import { formatDateIST } from '../../utils/dateTime';
import './ProductDashboard.css';

const PdIcon = ({ name }) => {
  const c = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  switch (name) {
    case 'total':
      return (
        <svg {...c}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="#2563eb" strokeWidth="1.75" />
          <path d="M8 7h8M8 11h6" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'active':
      return (
        <svg {...c} fill="#f97316" stroke="none">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case 'opened':
      return (
        <svg {...c}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5" />
        </svg>
      );
    case 'escalated':
      return (
        <svg {...c}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#fee2e2" stroke="#dc2626" strokeWidth="1.5" />
          <circle cx="12" cy="16" r="1" fill="#dc2626" />
          <path d="M12 9v4" stroke="#dc2626" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      );
    case 'new':
      return (
        <svg {...c}>
          <rect x="3" y="5" width="18" height="14" rx="2" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.5" />
          <text x="12" y="14.5" textAnchor="middle" fontSize="6" fontWeight="700" fill="#1d4ed8" fontFamily="system-ui,sans-serif">
            NEW
          </text>
        </svg>
      );
    case 'inProgress':
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" fill="#eef2ff" stroke="#4f46e5" strokeWidth="1.75" />
          <path d="M10 8.5v7l6-3.5-6-3.5z" fill="#4f46e5" />
        </svg>
      );
    case 'closed':
      return (
        <svg {...c}>
          <rect x="4" y="4" width="16" height="16" rx="3" fill="#d1fae5" stroke="#059669" strokeWidth="1.5" />
          <path d="M8 12l2.5 2.5L16 9" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
};

function PdMiniStat({ variant, label, value }) {
  return (
    <div className={`pd-mini pd-mini--${variant}`}>
      <span className="pd-mini__ico">
        <PdIcon name={variant} />
      </span>
      <span className="pd-mini__label">{label}</span>
      <span className="pd-mini__val">{value}</span>
    </div>
  );
}

const ProductDashboard = ({ onProductClick, variant = 'agent' }) => {
  const [products, setProducts] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const dashboardTitle = variant === 'manager' ? 'Manager Product Dashboard' : 'Product Dashboard';

  const goBack = () => {
    navigate(-1);
  };

  const pageHeader = (
    <header className="pd-page__header">
      <h1 className="pd-page__title">{dashboardTitle}</h1>
      <button type="button" className="pd-page__back" onClick={goBack}>
        ← Back
      </button>
    </header>
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const headers = getAuthHeaders();

      const productsResponse = await fetch('http://localhost:5000/api/sla/products', {
        method: 'GET',
        headers
      });
      const productsData = await productsResponse.json();

      const ticketsResponse = await fetch('http://localhost:5000/api/tickets', {
        method: 'GET',
        headers
      });
      const ticketsData = await ticketsResponse.json();

      if (productsData.success && ticketsData.success) {
        setProducts(productsData.data);
        setTickets(ticketsData.data);
      } else {
        setError('Failed to fetch data');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getProductStats = (productId) => {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      return {
        total: 0,
        active: 0,
        opened: 0,
        new: 0,
        inProgress: 0,
        escalated: 0,
        closed: 0
      };
    }

    const productTickets = tickets.filter((ticket) => {
      if (ticket.product_id === productId) return true;
      if (ticket.product && typeof ticket.product === 'string' && ticket.product.trim() !== '') {
        const ticketProduct = ticket.product.toLowerCase().trim();
        const productName = product.name.toLowerCase().trim();
        if (ticketProduct === productName) return true;
        if (productName.includes('grc') && ticketProduct.includes('grc')) return true;
        if (ticketProduct.includes(productName) || productName.includes(ticketProduct)) return true;
      }
      return false;
    });

    const newTickets = productTickets.filter((ticket) => ticket.status === 'new').length;
    const inProgressTickets = productTickets.filter((ticket) => ticket.status === 'in_progress').length;
    const escalatedTickets = productTickets.filter((ticket) => ticket.status === 'escalated').length;
    const closedTickets = productTickets.filter((ticket) => ticket.status === 'closed').length;
    const activeTickets = newTickets + inProgressTickets + escalatedTickets;
    const openedTickets = newTickets + inProgressTickets;

    return {
      total: productTickets.length,
      active: activeTickets,
      opened: openedTickets,
      new: newTickets,
      inProgress: inProgressTickets,
      escalated: escalatedTickets,
      closed: closedTickets
    };
  };

  const getSystemStats = () => {
    const ticketsWithoutProduct = tickets.filter(
      (t) => !t.product_id && (!t.product || t.product.trim() === '')
    ).length;
    return { ticketsWithoutProduct };
  };

  const handleProductClick = (product) => {
    if (onProductClick) {
      onProductClick(product);
    } else {
      navigate(`/business-tickets?product=${encodeURIComponent(product.name)}`);
    }
  };

  const formatFooterDate = (dateString) => {
    if (!dateString) return '—';
    return formatDateIST(dateString, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const systemStats = getSystemStats();

  if (loading) {
    return (
      <div className="product-dashboard pd-page">
        {pageHeader}
        <div className="product-dashboard-loading">
          <div className="loading-spinner" />
          <p>Loading products...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="product-dashboard pd-page">
        {pageHeader}
        <div className="product-dashboard-error">
          <h2>Error</h2>
          <p>{error}</p>
          <button type="button" onClick={fetchData} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="product-dashboard pd-page">
      {pageHeader}

      <div className="pd-grid">
        {products.map((product) => {
          const stats = getProductStats(product.id);
          const statusRaw = (product.status || 'active').toLowerCase();
          const isActive = statusRaw === 'active';

          return (
            <article key={product.id} className="pd-card">
              <div className="pd-card__head">
                <div className="pd-card__head-text">
                  <h2 className="pd-card__name">{product.name}</h2>
                  <p className="pd-card__desc">{product.description || 'No description available'}</p>
                </div>
                <span className={`pd-card__pill ${isActive ? 'pd-card__pill--active' : 'pd-card__pill--inactive'}`}>
                  {statusRaw}
                </span>
              </div>

              <div className="pd-card__body">
                <div className="pd-card__row pd-card__row--2">
                  <PdMiniStat variant="total" label="Total Tickets" value={stats.total} />
                  <PdMiniStat variant="active" label="Active" value={stats.active} />
                </div>
                <div className="pd-card__row pd-card__row--2">
                  <PdMiniStat variant="opened" label="Opened" value={stats.opened} />
                  <PdMiniStat variant="escalated" label="Escalated" value={stats.escalated} />
                </div>
                <div className="pd-card__row pd-card__row--3">
                  <PdMiniStat variant="new" label="New" value={stats.new} />
                  <PdMiniStat variant="inProgress" label="In Progress" value={stats.inProgress} />
                  <PdMiniStat variant="closed" label="Closed" value={stats.closed} />
                </div>
              </div>

              <div className="pd-card__rule" />

              <div className="pd-card__meta">
                <span className="pd-card__created">
                  Created by: <strong>{product.created_by_name || 'Unknown'}</strong>
                </span>
                <span className="pd-card__date">{formatFooterDate(product.created_at)}</span>
              </div>

              <button
                type="button"
                className="pd-card__cta"
                onClick={() => handleProductClick(product)}
              >
                View Tickets ({stats.total})
              </button>
            </article>
          );
        })}
      </div>

      {products.length === 0 && (
        <div className="no-products">
          <h2>No products found</h2>
          <p>No products have been created yet. Create your first product to get started.</p>
        </div>
      )}

      {systemStats.ticketsWithoutProduct > 0 && (
        <div className="tickets-without-product-info">
          <h3>Tickets without product association</h3>
          <p>
            There are {systemStats.ticketsWithoutProduct} tickets that don&apos;t have a proper product association.
            They won&apos;t appear in the product statistics above.
          </p>
        </div>
      )}
    </div>
  );
};

export default ProductDashboard;
