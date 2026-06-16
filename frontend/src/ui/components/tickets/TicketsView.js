import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { getAuthHeaders, buildApiUrl } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import './TicketsView.css';

function BtvStatIcon({ name }) {
  const c = { width: 28, height: 28, viewBox: '0 0 24 24', 'aria-hidden': true };
  switch (name) {
    case 'total':
      return (
        <svg {...c} fill="none">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="#6366f1" strokeWidth="1.75" strokeLinecap="round" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="#6366f1" strokeWidth="1.75" />
          <path d="M8 8h8M8 12h6" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'new':
      return (
        <svg {...c}>
          <rect x="4" y="5" width="16" height="14" rx="2" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.5" />
          <text x="12" y="14.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#1d4ed8" fontFamily="system-ui,sans-serif">
            NEW
          </text>
        </svg>
      );
    case 'in_progress':
      return (
        <svg {...c} fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          <circle cx="12" cy="12" r="3" fill="#2563eb" stroke="none" />
        </svg>
      );
    case 'escalated':
      return (
        <svg {...c} fill="none">
          <path
            d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            fill="#fee2e2"
            stroke="#dc2626"
            strokeWidth="1.5"
          />
          <circle cx="12" cy="16" r="1" fill="#dc2626" />
          <path d="M12 9v4" stroke="#dc2626" strokeWidth="1.75" strokeLinecap="round" />
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
}

function ticketMatchesProductFilter(ticket, productFilter, products) {
  if (!productFilter || !String(productFilter).trim()) return true;
  const filterLower = String(productFilter).toLowerCase().trim();

  if (ticket.product_id != null && ticket.product_id !== '') {
    const p = products.find((pr) => String(pr.id) === String(ticket.product_id));
    if (p?.name) {
      const n = p.name.toLowerCase().trim();
      if (n === filterLower || n.includes(filterLower) || filterLower.includes(n)) return true;
    }
  }

  if (ticket.product && typeof ticket.product === 'string') {
    const ticketProduct = ticket.product.toLowerCase().trim();
    return (
      ticketProduct === filterLower ||
      ticketProduct.includes(filterLower) ||
      filterLower.includes(ticketProduct)
    );
  }

  return false;
}

const TicketsView = () => {
  const [tickets, setTickets] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const productFilter = searchParams.get('product');

  // Default newest activity first (reopen/status changes should float up).
  const [sortConfig, setSortConfig] = useState({ key: 'updated_at', direction: 'desc' });

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl('/api/sla/products'), {
        method: 'GET',
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setProducts(json.data);
      }
    } catch {
      setProducts([]);
    }
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(buildApiUrl('/api/tickets'), {
        method: 'GET',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setTickets(data.data || []);
        } else {
          setError('Failed to fetch tickets');
        }
      } else {
        setError('Failed to fetch tickets');
      }
    } catch {
      setError('Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    fetchProducts();
  }, [fetchProducts]);

  const filteredTickets = useMemo(() => {
    if (!productFilter || !String(productFilter).trim()) {
      return tickets;
    }
    return tickets.filter((t) => ticketMatchesProductFilter(t, productFilter, products));
  }, [tickets, productFilter, products]);

  const counts = useMemo(() => {
    const list = filteredTickets;
    return {
      total: list.length,
      new: list.filter((t) => t.status === 'new').length,
      inProgress: list.filter((t) => t.status === 'in_progress').length,
      escalated: list.filter((t) => t.status === 'escalated').length,
      closed: list.filter((t) => t.status === 'closed').length
    };
  }, [filteredTickets]);

  const getProductLabel = (ticket) => {
    if (ticket.product && String(ticket.product).trim()) {
      return String(ticket.product).trim();
    }
    if (ticket.product_id != null && products.length) {
      const p = products.find((pr) => String(pr.id) === String(ticket.product_id));
      if (p?.name) return p.name;
    }
    return '—';
  };

  const statusKey = (ticket) => String(ticket?.status || '').toLowerCase() || 'unknown';

  const formatStatusText = (ticket) => {
    const k = statusKey(ticket);
    const map = {
      new: 'NEW',
      in_progress: 'IN PROGRESS',
      resolved: 'RESOLVED',
      escalated: 'ESCALATED',
      closed: 'CLOSED'
    };
    return map[k] || k.replace(/_/g, ' ').toUpperCase();
  };

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortIcon = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const sortedRows = useMemo(() => {
    const { key, direction } = sortConfig;
    const dir = direction === 'asc' ? 1 : -1;
    return [...filteredTickets].sort((a, b) => {
      let av;
      let bv;
      switch (key) {
        case 'issue_title':
          av = (a.issue_title || '').toLowerCase();
          bv = (b.issue_title || '').toLowerCase();
          break;
        case 'customer':
          av = `${a.name || ''} ${a.email || ''}`.toLowerCase();
          bv = `${b.name || ''} ${b.email || ''}`.toLowerCase();
          break;
        case 'product':
          av = getProductLabel(a).toLowerCase();
          bv = getProductLabel(b).toLowerCase();
          break;
        case 'organization':
          av = (a.organization_name || '').toLowerCase();
          bv = (b.organization_name || '').toLowerCase();
          break;
        case 'status':
          av = statusKey(a);
          bv = statusKey(b);
          break;
        case 'created_at':
          av = new Date(a.created_at || 0).getTime();
          bv = new Date(b.created_at || 0).getTime();
          break;
        case 'updated_at':
          av = new Date(a.updated_at || 0).getTime();
          bv = new Date(b.updated_at || 0).getTime();
          break;
        default:
          return 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filteredTickets, sortConfig, products]);

  const clearProductFilter = () => {
    setSearchParams({});
  };

  const openTicket = (ticket) => {
    const qs = location.search || '';
    navigate(`/ticket/${ticket.id}`, {
      state: {
        from: 'business-tickets',
        returnPath: `/business-tickets${qs}`,
        selectedProduct: productFilter || undefined
      }
    });
  };

  const productsListPath = location.pathname.startsWith('/business')
    ? '/business-products'
    : '/products';
  const goBackToProducts = () => navigate(productsListPath);

  if (loading) {
    return (
      <div className="btv-page btv-page--loading">
        <button type="button" className="btv-back-btn btv-back-btn--loading" onClick={goBackToProducts}>
          ← Back
        </button>
        <div className="btv-loading-center">
          <div className="btv-spinner" aria-hidden />
          <p className="btv-loading-text">Loading tickets…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="btv-page btv-page--error">
        <button type="button" className="btv-back-btn" onClick={goBackToProducts}>
          ← Back
        </button>
        <h2 className="btv-error-title">Something went wrong</h2>
        <p className="btv-error-msg">{error}</p>
        <button type="button" className="btv-btn btv-btn--primary" onClick={fetchTickets}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="btv-page">
      <header className="btv-header">
        <div className="btv-header__back-row">
          <button type="button" className="btv-back-btn" onClick={goBackToProducts}>
            ← Back
          </button>
        </div>
        <div className="btv-header__title-row">
          <span className="btv-header__emoji" aria-hidden>
            🎫
          </span>
          <h1 className="btv-header__title">Tickets</h1>
        </div>

        {productFilter ? (
          <div className="btv-filter-bar">
            <span className="btv-filter-bar__text">
              Filtered by product: <strong>{productFilter}</strong>
            </span>
            <button type="button" className="btv-clear-filter" onClick={clearProductFilter}>
              <span className="btv-clear-filter__x" aria-hidden>
                ×
              </span>
              Clear filter
            </button>
          </div>
        ) : null}

        <p className="btv-count">
          {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''} found
          {productFilter ? ` for '${productFilter}'` : ''}
        </p>
      </header>

      <section className="btv-kpi-row" aria-label="Ticket counts by status">
        <article className="btv-kpi">
          <div className="btv-kpi__icon">
            <BtvStatIcon name="total" />
          </div>
          <div className="btv-kpi__num">{counts.total}</div>
          <div className="btv-kpi__label">Total</div>
        </article>
        <article className="btv-kpi">
          <div className="btv-kpi__icon">
            <BtvStatIcon name="new" />
          </div>
          <div className="btv-kpi__num">{counts.new}</div>
          <div className="btv-kpi__label">New</div>
        </article>
        <article className="btv-kpi">
          <div className="btv-kpi__icon">
            <BtvStatIcon name="in_progress" />
          </div>
          <div className="btv-kpi__num">{counts.inProgress}</div>
          <div className="btv-kpi__label">In progress</div>
        </article>
        <article className="btv-kpi">
          <div className="btv-kpi__icon">
            <BtvStatIcon name="escalated" />
          </div>
          <div className="btv-kpi__num">{counts.escalated}</div>
          <div className="btv-kpi__label">Escalated</div>
        </article>
        <article className="btv-kpi">
          <div className="btv-kpi__icon">
            <BtvStatIcon name="closed" />
          </div>
          <div className="btv-kpi__num">{counts.closed}</div>
          <div className="btv-kpi__label">Closed</div>
        </article>
      </section>

      <div className="btv-table-wrap">
        {filteredTickets.length === 0 ? (
          <div className="btv-empty">
            <h2 className="btv-empty__title">No tickets</h2>
            <p className="btv-empty__text">
              {productFilter
                ? `No tickets found for product "${productFilter}".`
                : 'No tickets found in the system.'}
            </p>
          </div>
        ) : (
          <div className="btv-table-scroll">
            <table className="btv-table">
              <thead>
                <tr>
                  <th scope="col">
                    <button type="button" className="btv-th-btn" onClick={() => handleSort('issue_title')}>
                      Issue title {sortIcon('issue_title')}
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="btv-th-btn" onClick={() => handleSort('customer')}>
                      Customer {sortIcon('customer')}
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="btv-th-btn" onClick={() => handleSort('product')}>
                      Product {sortIcon('product')}
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="btv-th-btn" onClick={() => handleSort('organization')}>
                      Organization {sortIcon('organization')}
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="btv-th-btn" onClick={() => handleSort('status')}>
                      Status {sortIcon('status')}
                    </button>
                  </th>
                  <th scope="col">
                    <button type="button" className="btv-th-btn" onClick={() => handleSort('created_at')}>
                      Created {sortIcon('created_at')}
                    </button>
                  </th>
                  <th scope="col" className="btv-th-actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((ticket) => {
                  const sk = statusKey(ticket);
                  return (
                    <tr key={ticket.id}>
                      <td className="btv-td-issue">{ticket.issue_title || 'No title'}</td>
                      <td className="btv-td-customer">
                        <span className="btv-customer-name">{ticket.name || '—'}</span>
                        <span className="btv-customer-email">{ticket.email || ''}</span>
                      </td>
                      <td>
                        <span className="btv-product-pill">{getProductLabel(ticket)}</span>
                      </td>
                      <td>
                        <span className="btv-organization-label" style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                          {ticket.organization_name || '—'}
                        </span>
                      </td>
                      <td>
                        <span className={`btv-status-pill btv-status-pill--${sk}`}>
                          {sk === 'escalated' ? (
                            <svg
                              className="btv-status-pill__ico"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden
                            >
                              <path
                                d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                                fill="currentColor"
                                opacity="0.25"
                              />
                              <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          ) : null}
                          {formatStatusText(ticket)}
                        </span>
                      </td>
                      <td className="btv-td-muted">
                        {formatDateTimeIST(ticket.created_at, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </td>
                      <td className="btv-td-actions">
                        <button type="button" className="btv-view-btn" onClick={() => openTicket(ticket)}>
                          View Ticket
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketsView;
