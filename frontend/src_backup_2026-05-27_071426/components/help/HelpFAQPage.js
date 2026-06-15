import React, { useState, useEffect, useMemo } from 'react';
import { buildApiUrl, getAuthHeaders } from '../../utils/api';
import './HelpFAQPage.css';

const FAQ_CATEGORIES = [
  'Billing', 'Login', 'Communication', 'Technical Support', 'Account',
  'General', 'Feature Request', 'Bug Report', 'Onboarding', 'Integrations',
  'Security', 'Performance', 'Documentation', 'Other'
];

const normalizeValue = (value) => String(value || '').trim().toLowerCase();

const HelpFAQPage = ({ initialProduct, onProceedToTicket, onSkipToDashboard, products: propProducts }) => {
  const [products, setProducts] = useState(propProducts || []);
  const [faqs, setFaqs] = useState([]);
  const [categories, setCategories] = useState([...FAQ_CATEGORIES]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // Always start the Support Center landing view on "All Products".
  // `initialProduct` is still used later for ticket prefill (Create Support Ticket).
  const [activeProduct, setActiveProduct] = useState('All Products');
  const [activeCategory, setActiveCategory] = useState('All Categories');
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);

  const resolveCanonicalProduct = useMemo(() => {
    const list = Array.isArray(products) ? products : [];
    const byName = new Map();
    const bySlug = new Map();
    for (const p of list) {
      const name = typeof p === 'object' ? p?.name : p;
      const slug = typeof p === 'object' ? p?.slug : null;
      const nameKey = normalizeValue(name);
      const slugKey = normalizeValue(slug);
      if (name && nameKey) byName.set(nameKey, String(name).trim());
      if (slug && slugKey) bySlug.set(slugKey, String(name).trim());
    }
    return (value) => {
      const key = normalizeValue(value);
      if (!key) return null;
      return byName.get(key) || bySlug.get(key) || null;
    };
  }, [products]);

  useEffect(() => {
    if (propProducts && propProducts.length) {
      setProducts(propProducts);
      return;
    }

    const fetchProducts = async () => {
      try {
        const slaRes = await fetch(buildApiUrl('/api/sla/products'), { headers: getAuthHeaders() });
        const slaData = slaRes.ok ? await slaRes.json() : {};
        const fromSla = Array.isArray(slaData.data) ? slaData.data : [];
        setProducts(fromSla);
      } catch (e) {
        console.error('Failed to fetch products:', e);
      }
    };

    fetchProducts();
  }, [propProducts]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/faqs/categories'), { headers: getAuthHeaders() });
        const data = res.ok ? await res.json() : {};
        const fromApi = (data.success ? data.data || [] : []).filter(Boolean);
        setCategories([...new Set([...FAQ_CATEGORIES, ...fromApi])].filter(Boolean));
      } catch {
        setCategories([...FAQ_CATEGORIES]);
      }
    };
    fetchCategories();
  }, []);

  const productOptions = useMemo(() => {
    const names = (Array.isArray(products) ? products : []).map((p) => (typeof p === 'object' ? p?.name : p)).filter(Boolean);
    return ['All Products', ...names];
  }, [products]);

  useEffect(() => {
    // Normalize any slug/unknown initial product into a real dropdown option (or fall back to All Products).
    // Important: never force-select a specific product when the user chose "All Products".
    if (activeProduct && activeProduct !== 'All Products') {
      const canonical = resolveCanonicalProduct(activeProduct);
      if (canonical && canonical !== activeProduct) {
        setActiveProduct(canonical);
        return;
      }
    }
    const currentKey = normalizeValue(activeProduct);
    const optionKeys = new Set(productOptions.map((p) => normalizeValue(p)));
    if (currentKey && !optionKeys.has(currentKey)) {
      setActiveProduct('All Products');
    }
  }, [activeProduct, productOptions, resolveCanonicalProduct]);

  const categoryOptions = useMemo(() => {
    const list = (categories || []).filter(Boolean);
    return ['All Categories', ...list];
  }, [categories]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (activeProduct && activeProduct !== 'All Products') params.set('product', activeProduct);
        if (activeCategory && activeCategory !== 'All Categories') params.set('category', activeCategory);
        if (searchTerm && searchTerm.trim()) params.set('search', searchTerm.trim());
        const isLandingAll = (!searchTerm || !searchTerm.trim()) &&
          (!activeProduct || activeProduct === 'All Products') &&
          (!activeCategory || activeCategory === 'All Categories');
        params.set('semantic', '1');
        // Keep landing page compact so CTA stays visible.
        // When no filters/search, fetch one FAQ per product (capped) so the list isn't biased.
        params.set('limit', isLandingAll ? '6' : '20');
        if (isLandingAll) {
          params.set('random', '1');
          params.set('per_product', '1');
        }

        const url = buildApiUrl(`/api/faqs?${params.toString()}`);
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setFaqs(data.success ? data.data || [] : []);
      } catch {
        if (cancelled) return;
        setFaqs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeProduct, activeCategory, searchTerm]);

  const handleProceed = () => {
    const firstMatch = faqs[0];
    const issueType = firstMatch?.category || firstMatch?.issue_type || 'General';
    const product = activeProduct === 'All Products' ? (initialProduct || '') : activeProduct;
    onProceedToTicket?.({ issueType, product });
  };

  return (
    <div className="help-faq-page">
      <header className="faq-topbar">
        <div className="faq-topbar-inner">
          <div className="faq-topbar-left">
            <span className="faq-topbar-icon">?</span>
            <span className="faq-topbar-title">Support Center</span>
          </div>
          <button className="faq-skip-btn" type="button" onClick={onSkipToDashboard}>
            Skip to Dashboard <span className="faq-skip-arrow">›</span>
          </button>
        </div>
      </header>

      <section className="faq-hero">
        <h1>How can we help you?</h1>
        <p>Browse frequently asked questions or create a support ticket.</p>
        <div className="faq-search-wrap">
          <span className="faq-search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search by keyword (e.g., login issue, access error)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="faq-dropdown-filters">
          <div className="faq-dropdown-field">
            <label htmlFor="faq-product">Product</label>
            <select id="faq-product" value={activeProduct} onChange={(e) => setActiveProduct(e.target.value)}>
              {productOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="faq-dropdown-field">
            <label htmlFor="faq-category">Category</label>
            <select id="faq-category" value={activeCategory} onChange={(e) => setActiveCategory(e.target.value)}>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="faq-content-shell">
        <div className="faq-list">
          {loading ? (
            <div className="faq-empty-state">Loading FAQs...</div>
          ) : faqs.length === 0 ? (
            <div className="faq-empty-state">
              <div className="faq-empty-title">No FAQs found for this search</div>
              <div className="faq-empty-subtitle">Try different keywords or remove filters.</div>
            </div>
          ) : (
            faqs.map((faq) => {
              const expanded = expandedQuestionId === faq.id;
              return (
                <div key={faq.id} className="faq-item">
                  <button
                    className="faq-item-head"
                    type="button"
                    onClick={() => setExpandedQuestionId(expanded ? null : faq.id)}
                  >
                    <div className="faq-item-left">
                      <span className="faq-item-question">{faq.question}</span>
                      <span className="faq-item-tag">{faq.product || faq.product_name || 'General'}</span>
                    </div>
                    <span className="faq-item-chevron">{expanded ? '˄' : '˅'}</span>
                  </button>
                  {expanded && <div className="faq-item-answer">{faq.answer}</div>}
                </div>
              );
            })
          )}
        </div>

        <div className="faq-bottom-cta">
          <h3>Still need help?</h3>
          <p>If your issue isn&apos;t listed or hasn&apos;t been resolved, our support team is ready to assist you.</p>
          <button type="button" className="faq-create-ticket-btn" onClick={handleProceed}>
            Create Support Ticket
          </button>
        </div>
      </section>
    </div>
  );
};

export default HelpFAQPage;
