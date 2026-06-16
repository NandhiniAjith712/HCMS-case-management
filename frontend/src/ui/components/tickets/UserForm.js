import React, { useState, useEffect } from 'react';
import { getAuthHeaders, getAuthHeadersFormData, authenticatedFetch, buildApiUrl } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import './UserForm.css';
import ReactSelect from 'react-select';
import ReactCountryFlag from 'react-country-flag';

const UserForm = ({ user, onSubmit, onClose, initialProduct, initialIssueType, managerMode }) => {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    mobile: '',
    product: initialProduct || '',
    module: '',
    issueType: initialIssueType || '',
    issueTypeOther: '',
    issueTitle: '',
    description: '',
    user_selected_priority: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [ticketId, setTicketId] = useState(null);
  const [replies, setReplies] = useState([]);
  const [products, setProducts] = useState([]);
  const [modules, setModules] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingModules, setLoadingModules] = useState(false);
  const [selectedSLA, setSelectedSLA] = useState(null);
  const [autoLoginProduct, setAutoLoginProduct] = useState(null);
  const [utmModuleFromContext, setUtmModuleFromContext] = useState(null);
  const countryOptions = [
    { value: '+1', label: 'United States', code: 'US' },
    { value: '+91', label: 'India', code: 'IN' },
    { value: '+44', label: 'United Kingdom', code: 'GB' },
    { value: '+61', label: 'Australia', code: 'AU' },
    { value: '+81', label: 'Japan', code: 'JP' },
    { value: '+49', label: 'Germany', code: 'DE' },
    { value: '+971', label: 'United Arab Emirates', code: 'AE' },
    { value: '+880', label: 'Bangladesh', code: 'BD' },
    { value: '+234', label: 'Nigeria', code: 'NG' },
    { value: '+86', label: 'China', code: 'CN' },
    { value: '+7', label: 'Russia', code: 'RU' },
    { value: '+33', label: 'France', code: 'FR' },
    { value: '+39', label: 'Italy', code: 'IT' },
    { value: '+55', label: 'Brazil', code: 'BR' },
    { value: '+20', label: 'Egypt', code: 'EG' },
    { value: '+63', label: 'Philippines', code: 'PH' },
    { value: '+27', label: 'South Africa', code: 'ZA' },
    { value: '+82', label: 'South Korea', code: 'KR' },
    { value: '+34', label: 'Spain', code: 'ES' },
    { value: '+60', label: 'Malaysia', code: 'MY' },
    { value: '+65', label: 'Singapore', code: 'SG' },
    { value: '+966', label: 'Saudi Arabia', code: 'SA' },
    { value: '+972', label: 'Israel', code: 'IL' },
    { value: '+92', label: 'Pakistan', code: 'PK' },
    { value: '+212', label: 'Morocco', code: 'MA' },
    { value: '+351', label: 'Portugal', code: 'PT' },
    { value: '+380', label: 'Ukraine', code: 'UA' },
    { value: '+84', label: 'Vietnam', code: 'VN' },
    { value: '+852', label: 'Hong Kong', code: 'HK' },
    { value: '+886', label: 'Taiwan', code: 'TW' },
  ];
  const [countryCode, setCountryCode] = useState(countryOptions[0]);
  const managerAgentOptions = managerMode?.agents || [];

  // FAQ module archived - removed "FAQ / General Question" issue type
  const issueTypes = [
    // 'FAQ / General Question',
    'Bug Report',
    'Support Request',
    'Clarification',
    'Technical Support',
    'Billing Issue',
    'Account Access',
    'Product Inquiry',
    'Feature Request',
    'Other'
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    console.log(`🔄 Form input change: ${name} = ${value}`);
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Handle product selection
    if (name === 'product') {
      console.log('🔄 Product selected:', value);
      
      // Reset dependent fields when product changes
      setFormData(prev => ({
        ...prev,
        module: '', // Reset module when product changes
        [name]: value
      }));
      setSelectedSLA(null); // Reset SLA display
      
      if (value) {
        // Check if the selected product exists in the loaded products
        const selectedProduct = products.find(p => p.name === value);
        if (selectedProduct) {
          console.log('✅ Found selected product in products list:', selectedProduct);
          console.log('🔗 Product ID linked for module loading:', selectedProduct.id);
          console.log('🔄 Manual selection - Product name linked to ID:', selectedProduct.name, '→', selectedProduct.id);
          
          // Fetch modules using the correct product ID
          fetchModules(selectedProduct.id);
        } else {
          console.log('⚠️ Selected product not found in products list:', value);
          console.log('🔄 Attempting to fetch modules by product name as fallback');
          // Try to fetch modules using product name as fallback
          fetchModulesByName(value);
        }
      } else {
        setModules([]);
      }
    }

    // Handle module selection
    if (name === 'module') {
      // Reset user-selected priority when module changes (policy may differ by module).
      setFormData((prev) => ({ ...prev, user_selected_priority: '' }));
      if (value) {
        const selectedModule = modules.find(m => m.name === value);
        if (selectedModule) {
          console.log('✅ Module selected:', selectedModule.name);
          console.log('🔗 Module ID linked for SLA loading:', selectedModule.id);
          console.log('🔄 Manual selection - Module name linked to ID:', selectedModule.name, '→', selectedModule.id);
          // SLA is snapshotted by backend at ticket creation; frontend does not compute/guess SLA.
          setSelectedSLA('SLA will be assigned after ticket creation');
        }
      } else {
        setSelectedSLA(null);
      }
    }
  };

  const handleCountryCodeChange = (e) => {
    setCountryCode(e.target.value);
  };

  const MAX_FILES = 10;
  const MAX_SIZE_BYTES = 5 * 1024 * 1024;
  const ACCEPTED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain'
  ]);

  const formatBytes = (bytes) => {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const idx = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
    const val = n / Math.pow(1024, idx);
    return `${val.toFixed(val >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  };

  const validateFile = (file) => {
    if (!file) return 'Invalid file.';
    if (file.size > MAX_SIZE_BYTES) return `File too large (${formatBytes(file.size)}). Max 5 MB.`;
    if (file.type && !ACCEPTED_MIME.has(file.type)) return `Unsupported file type (${file.type || 'unknown'}).`;
    return null;
  };

  const handleFilesChange = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;

    setAttachments((prev) => {
      const next = [...prev];
      for (const f of picked) {
        if (next.length >= MAX_FILES) break;
        const err = validateFile(f);
        if (err) {
          alert(err);
          continue;
        }
        const key = `${f.name}-${f.size}-${f.lastModified}`;
        const exists = next.some((x) => `${x.name}-${x.size}-${x.lastModified}` === key);
        if (!exists) next.push(f);
      }
      return next;
    });

    // allow re-picking same file(s)
    e.target.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // Using centralized getAuthHeaders from utils/api.js

  const fetchProducts = async () => {
    try {
      setLoadingProducts(true);
      const headers = getAuthHeaders();
      console.log('🔍 Fetching products with headers:', headers);
      
      const response = await fetch('/api/sla/products', {
        method: 'GET',
        headers: headers
      });
      
      console.log('📡 Products response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('📦 Products fetched:', result);
        setProducts(result.data || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Failed to fetch products:', response.status, errorData);
        setProducts([]);
      }
    } catch (error) {
      console.error('❌ Error fetching products:', error);
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchModules = async (productId) => {
    try {
      setLoadingModules(true);
      console.log('🔄 Fetching modules for product ID:', productId);
      const headers = getAuthHeaders();
      const response = await fetch(`/api/sla/products/${productId}/modules`, {
        method: 'GET',
        headers: headers
      });
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Modules fetched successfully:', result.data);
        setModules(result.data || []);
      } else {
        console.error('Failed to fetch modules');
        setModules([]);
      }
    } catch (error) {
      console.error('Error fetching modules:', error);
      setModules([]);
    } finally {
      setLoadingModules(false);
    }
  };

  // Fallback function to fetch modules by product name when product ID is not available
  const fetchModulesByName = async (productName) => {
    try {
      setLoadingModules(true);
      console.log('🔄 Fetching modules by product name:', productName);
      
      // Try to find the product by name first in the loaded products
      const product = products.find(p => p.name === productName);
      if (product) {
        console.log('✅ Found product by name in loaded products, fetching modules by ID:', product.id);
        console.log('🔗 Product ID linked successfully:', product.id);
        fetchModules(product.id);
        return;
      }
      
      console.log('⚠️ Product not found in loaded products, checking backend...');
      
      // If product not found in local products, try to fetch from backend by name
      // NOTE: This endpoint needs to be created in the backend: /api/sla/products/by-name/{productName}/modules
      const headers = getAuthHeaders();
      const response = await fetch(`/api/sla/products/by-name/${encodeURIComponent(productName)}/modules`, {
        method: 'GET',
        headers: headers
      });
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Modules fetched by product name from backend:', result.data);
        setModules(result.data || []);
      } else {
        console.log('⚠️ No modules found for product name in backend:', productName);
        setModules([]);
      }
    } catch (error) {
      console.error('Error fetching modules by product name:', error);
      setModules([]);
    } finally {
      setLoadingModules(false);
    }
  };

  // SLA is resolved and stored by backend at ticket creation; do not fetch/guess on frontend.

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (!selectedSLA) {
      setSelectedSLA('SLA will be assigned after ticket creation');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FAQ module archived - Help FAQ page no longer provides prefill
  // Apply prefill from Help FAQ page (issue type + product)
  // useEffect(() => {
  //   if (initialProduct || initialIssueType) {
  //     setFormData(prev => ({
  //       ...prev,
  //       ...(initialProduct && { product: initialProduct }),
  //       ...(initialIssueType && { issueType: initialIssueType })
  //     }));
  //     if (initialProduct) setAutoLoginProduct(initialProduct);
  //   }
  // }, [initialProduct, initialIssueType]);

  // Check for auto-login context and pre-fill form
  // When initialProduct/initialIssueType are provided (from Help FAQ page), they take precedence
  useEffect(() => {
    const autoLoginContext = localStorage.getItem('autoLoginContext');
    if (autoLoginContext) {
      try {
        const context = JSON.parse(autoLoginContext);
        console.log('🔗 Auto-login context found:', context);
        
        const useContextProduct = !initialProduct && context.product;
        const useContextModule = !initialProduct && context.utmModule;
        
        // Store auto-login product only if not overridden by Help page prefill
        if (context.product && !initialProduct) {
          setAutoLoginProduct(context.product);
          console.log('🎯 Auto-login product stored:', context.product);
        }
        if (context.utmModule) {
          setUtmModuleFromContext(context.utmModule);
          console.log('🎯 UTM module for pre-fill:', context.utmModule);
        }
        
        // Pre-fill form with auto-login data; do NOT overwrite product/issueType when from Help page
        setFormData(prev => ({
          ...prev,
          name: context.name || context.email?.split('@')[0] || prev.name,
          email: context.email || prev.email,
          ...(useContextProduct && { product: context.product }),
          ...(useContextModule && { module: context.utmModule || prev.module })
        }));
        
        console.log('🎯 Set initial form data with product:', useContextProduct ? context.product : '(from Help page)');
        
        // Force immediate product selection if products are already loaded (only when using context product)
        if (products.length > 0 && useContextProduct && context.product) {
          console.log('🔄 Products already loaded, checking for immediate product selection');
          const productExists = products.find(p => p.name === context.product);
          if (productExists) {
            console.log('✅ Immediate product selection - found in loaded products:', context.product);
            setFormData(prev => ({
              ...prev,
              product: productExists.name
            }));
            fetchModules(productExists.id);
          }
        }
        
        // If phone is available, set it with proper country code detection
        if (context.phone) {
          console.log('📱 Processing phone number:', context.phone);
          
          // Handle phone number with or without country code
          let phoneNumber = context.phone;
          let countryCode = '+1'; // Default to US
          
          // If phone starts with +, extract country code
          if (context.phone.startsWith('+')) {
            // Find matching country code
            for (const option of countryOptions) {
              if (context.phone.startsWith(option.value)) {
                countryCode = option.value;
                phoneNumber = context.phone.substring(option.value.length);
                break;
              }
            }
          } else {
            // If no country code, assume it's a 10-digit US number
            if (context.phone.length === 10) {
              countryCode = '+1';
              phoneNumber = context.phone;
            }
          }
          
          // Set country code
          const foundCountry = countryOptions.find(option => option.value === countryCode);
          if (foundCountry) {
            setCountryCode(foundCountry);
            console.log('🌍 Set country code to:', foundCountry.label, foundCountry.value);
          }
          
          // Set phone number (without country code)
          setFormData(prev => ({
            ...prev,
            mobile: phoneNumber
          }));
          
          console.log('📱 Set phone number:', phoneNumber, 'with country code:', countryCode);
        }
        
        // DON'T clear the auto-login context yet - wait for products to load
        console.log('✅ Form pre-filled with auto-login data (context preserved)');
        
      } catch (error) {
        console.error('❌ Error parsing auto-login context:', error);
        localStorage.removeItem('autoLoginContext');
      }
    }
  }, [initialProduct, initialIssueType]); // Respect Help page prefill - don't overwrite when provided

    // Separate useEffect to handle product selection after products are loaded
  useEffect(() => {
    if (products.length > 0) {
      console.log('🔄 Products loaded, checking for auto-login product');
      console.log('📋 Available products:', products.map(p => `${p.name} (ID: ${p.id})`));
      
      // Check if we have auto-login product to set
      if (autoLoginProduct) {
        console.log('🎯 Auto-login product to set:', autoLoginProduct);
        
        // Check if the auto-login product exists in the loaded products
        const productExists = products.find(p => p.name === autoLoginProduct);
        if (productExists) {
          console.log('✅ Auto-login product found in products:', autoLoginProduct);
          console.log('🔗 Product ID linked:', productExists.id);
          
          // Set the product in form data
          console.log('🔄 Setting auto-login product in form:', productExists.name);
          setFormData(prev => ({
            ...prev,
            product: productExists.name
          }));
          
          // Force a re-render to ensure the dropdown updates
          setTimeout(() => {
            console.log('🔄 Force re-render for product dropdown');
            setFormData(prev => ({ ...prev }));
          }, 100);
          
          // Fetch modules for the selected product using the correct ID
          console.log('🔄 Fetching modules for product ID:', productExists.id);
          fetchModules(productExists.id);
          
          // Clear the auto-login product and context after successful product selection
          setTimeout(() => {
            setAutoLoginProduct(null);
            localStorage.removeItem('autoLoginContext');
            console.log('✅ Auto-login product and context cleared after product selection');
          }, 2000); // Delay clearing to ensure form is updated
        } else {
          console.log('⚠️ Auto-login product not found in products list:', autoLoginProduct);
          console.log('🔍 Available product names:', products.map(p => p.name));
          
          // Try to fetch modules using product name as fallback
          console.log('🔄 Attempting to fetch modules for auto-login product:', autoLoginProduct);
          fetchModulesByName(autoLoginProduct);
          
          // Clear the auto-login product and context even if product not found
          setTimeout(() => {
            setAutoLoginProduct(null);
            localStorage.removeItem('autoLoginContext');
            console.log('✅ Auto-login product and context cleared (product not found)');
          }, 2000);
        }
      } else {
        // Check if formData.product is set but autoLoginProduct is not
        if (formData.product && !autoLoginProduct) {
          console.log('🔄 Form has product but no auto-login product:', formData.product);
          
          const productExists = products.find(p => p.name === formData.product);
          if (productExists) {
            console.log('✅ Product found in products:', formData.product);
            console.log('🔗 Product ID linked:', productExists.id);
            
            // Fetch modules for the selected product using the correct ID
            console.log('🔄 Fetching modules for product ID:', productExists.id);
            fetchModules(productExists.id);
          } else {
            console.log('⚠️ Product not found in products list:', formData.product);
            console.log('🔄 Attempting to fetch modules for product:', formData.product);
            fetchModulesByName(formData.product);
            setModules([]);
          }
        }
      }
    }
  }, [products, autoLoginProduct]); // Watch both products and autoLoginProduct

  // Pre-select module from UTM when modules are loaded (external systems: GRC, VoiceLoop)
  useEffect(() => {
    if (utmModuleFromContext && modules.length > 0 && formData.product) {
      const match = modules.find(m =>
        (m.name && m.name.toLowerCase() === utmModuleFromContext.toLowerCase()) ||
        (m.name && m.name.toLowerCase().includes(utmModuleFromContext.toLowerCase()))
      );
      if (match) {
        setFormData(prev => (prev.module === match.name ? prev : { ...prev, module: match.name }));
        setUtmModuleFromContext(null);
      }
    }
  }, [modules, utmModuleFromContext, formData.product]);

  // Debug useEffect to log form data changes
  useEffect(() => {
    console.log('📊 Form data updated:', formData);
    console.log('🎯 Product field value:', formData.product);
    console.log('📋 Products loaded:', products.length);
    console.log('🔍 Auto-login context exists:', !!localStorage.getItem('autoLoginContext'));
    console.log('🎯 Auto-login product state:', autoLoginProduct);
  }, [formData, products, autoLoginProduct]);

  // Check for URL parameters as fallback - standard format: m, u, e
  useEffect(() => {
    const autoLoginContext = localStorage.getItem('autoLoginContext');
    if (autoLoginContext) {
      console.log('🔗 Auto-login context exists, skipping URL parameter check');
      return;
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('e') || urlParams.get('email');
    const productParam = urlParams.get('product');
    const nameParam = urlParams.get('u') || urlParams.get('name');
    const phoneParam = urlParams.get('phone');
    
    if (emailParam || productParam || nameParam || phoneParam) {
      console.log('🔗 URL parameters found for auto-fill:', { emailParam, productParam, nameParam, phoneParam });
      
      setFormData(prev => ({
        ...prev,
        name: nameParam || emailParam?.split('@')[0] || prev.name,
        email: emailParam || prev.email,
        product: productParam || prev.product
      }));
      
      // Handle phone number from URL
      if (phoneParam) {
        console.log('📱 Processing phone number from URL:', phoneParam);
        
        let phoneNumber = phoneParam;
        let countryCode = '+1'; // Default to US
        
        // If phone starts with +, extract country code
        if (phoneParam.startsWith('+')) {
          // Find matching country code
          for (const option of countryOptions) {
            if (phoneParam.startsWith(option.value)) {
              countryCode = option.value;
              phoneNumber = phoneParam.substring(option.value.length);
              break;
            }
          }
        } else {
          // If no country code, assume it's a 10-digit US number
          if (phoneParam.length === 10) {
            countryCode = '+1';
            phoneNumber = phoneParam;
          }
        }
        
        // Set country code
        const foundCountry = countryOptions.find(option => option.value === countryCode);
        if (foundCountry) {
          setCountryCode(foundCountry);
          console.log('🌍 Set country code to:', foundCountry.label, foundCountry.value);
        }
        
        // Set phone number (without country code)
        setFormData(prev => ({
          ...prev,
          mobile: phoneNumber
        }));
        
        console.log('📱 Set phone number from URL:', phoneNumber, 'with country code:', countryCode);
      }
    }
  }, []); // Remove products dependency to avoid infinite loops

  const fetchReplies = async (id) => {
    const headers = getAuthHeaders();
    try {
      const response = await fetch(`/api/replies/${id}`, {
        method: 'GET',
        headers: headers
      });
      if (response.ok) {
        const result = await response.json();
        setReplies(result.data);
      } else {
        setReplies([]);
      }
    } catch (error) {
      setReplies([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formDataToSend = new FormData();

      const selectedProductRow = products.find((p) => p.name === formData.product);
      const productPriorityPolicy = String(selectedProductRow?.priority_allocation_type || 'ai_only').toLowerCase();
      const requiresUserPriority = productPriorityPolicy === 'user_then_ai_verify';
      if (requiresUserPriority && !String(formData.user_selected_priority || '').trim()) {
        alert('Please select a priority for this product.');
        setIsSubmitting(false);
        return;
      }
      
      // Add form fields
      formDataToSend.append('name', formData.name);
      formDataToSend.append('email', formData.email);
      formDataToSend.append('mobile', formData.mobile ? (countryCode.value + formData.mobile) : '');
      formDataToSend.append('product', formData.product);
      formDataToSend.append('module', formData.module);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('issueType', formData.issueType);
      if (formData.issueType === 'Other') {
        formDataToSend.append('issueTypeOther', formData.issueTypeOther);
      }
      formDataToSend.append('issueTitle', formData.issueTitle);
      if (requiresUserPriority) {
        formDataToSend.append('user_selected_priority', String(formData.user_selected_priority || '').trim().toLowerCase());
      }
      if (user && user.id) {
        formDataToSend.append('userId', user.id);
      }
      // Pass utm_description when from support URL (UTM-based tracking)
      const autoLoginContext = localStorage.getItem('autoLoginContext');
      if (autoLoginContext) {
        try {
          const ctx = JSON.parse(autoLoginContext);
          if (ctx.utmDescription && ctx.source === 'support-url') {
            formDataToSend.append('utm_description', ctx.utmDescription);
          }
        } catch (_) {}
      }
      
      // Add attachment if selected
      attachments.forEach((file) => formDataToSend.append('attachments', file));

      // When used by manager, optionally include explicit assignee (agent)
      if (managerMode && managerMode.assignAgentId) {
        formDataToSend.append('assignedAgentId', managerMode.assignAgentId);
      }

      // Use centralized auth headers (customer token when on support/user path)
      const headers = getAuthHeadersFormData();

      console.log('📤 Submitting ticket with headers');

      const response = await fetch(buildApiUrl('/api/tickets'), {
        method: 'POST',
        headers,
        body: formDataToSend
      });

      if (response.ok) {
        const result = await response.json();
        setSubmitStatus('success');
        
        // Preserve auto-login data for future submissions
        const autoLoginContext = localStorage.getItem('autoLoginContext');
        let preservedEmail = '';
        let preservedProduct = '';
        
        if (autoLoginContext) {
          try {
            const context = JSON.parse(autoLoginContext);
            preservedEmail = context.email || '';
            preservedProduct = context.product || '';
          } catch (error) {
            console.error('Error parsing auto-login context:', error);
          }
        }
        
        setFormData({
          name: '',
          email: preservedEmail,
          mobile: '',
          product: preservedProduct,
          module: '',
          issueType: '',
          issueTypeOther: '',
          issueTitle: '',
          description: '',
          user_selected_priority: ''
        });
        setAttachments([]);

        if (result.data && result.data.id) {
          setTicketId(result.data.id);
          fetchReplies(result.data.id);
        }
        
        if (user && user.id && !user.name && formData.name) {
          try {
            const updateHeaders = getAuthHeaders();
            await fetch(`/api/users/${user.id}`, {
              method: 'PATCH',
              headers: updateHeaders,
              body: JSON.stringify({ name: formData.name })
            });
            const updatedUser = { ...user, name: formData.name };
            localStorage.setItem('tickUser', JSON.stringify(updatedUser));
          } catch (error) {
            console.warn('Error updating user name:', error);
          }
        }

        if (onSubmit) {
          onSubmit(result.data || { id: result.ticketId || result.id });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Submission error:', errorData);
        if (errorData.errors && errorData.errors.length > 0) {
          const errorMessages = errorData.errors.map(err => `${err.path}: ${err.msg}`).join('\n');
          alert('Please fix the following errors:\n' + errorMessages);
        } else if (errorData.message) {
          alert(`Error: ${errorData.message}`);
        } else {
          alert('Failed to submit ticket. Please try again.');
        }
        setSubmitStatus('error');
      }
    } catch (error) {
      console.error('Processing error:', error);
      alert(`Error: ${error.message || 'An unexpected error occurred during submission.'}`);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeForm = () => {
    if (onClose) onClose();
    else window.parent.postMessage({ action: 'toggleForm' }, '*');
  };

  const pickByKeyword = (items, getLabel, keywords) => {
    const lowerKeywords = (keywords || []).map((k) => String(k).toLowerCase());
    const scored = (items || []).map((item) => {
      const label = String(getLabel(item) || '').toLowerCase();
      let score = 0;
      for (const kw of lowerKeywords) {
        if (!kw) continue;
        if (label === kw) score += 100;
        else if (label.includes(kw)) score += 10;
      }
      return { item, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.score ? scored[0].item : null;
  };

  const loadSampleData = async () => {
    const india = countryOptions.find((c) => c.value === '+91') || countryOptions[0];
    setCountryCode(india);

    let productName = '';
    let moduleName = '';
    if (products.length > 0) {
      const p =
        pickByKeyword(products, (x) => x?.name, ['grc', 'governance', 'risk', 'compliance', 'audit']) ||
        products[0];
      productName = p?.name || '';
      setLoadingModules(true);
      try {
        const headers = getAuthHeaders();
        const res = await fetch(buildApiUrl(`/api/sla/products/${p.id}/modules`), {
          method: 'GET',
          headers
        });
        if (res.ok) {
          const result = await res.json();
          const modList = result.data || [];
          setModules(modList);
          const m =
            pickByKeyword(modList, (x) => x?.name, ['access', 'user', 'identity', 'audit', 'workflow', 'review', 'sox']) ||
            modList[0];
          if (m) {
            moduleName = m.name;
          }
        }
      } catch {
        // ignore
      } finally {
        setLoadingModules(false);
      }
    }

    // Define multiple sample templates for variety
    const samplePool = [
      {
        name: 'Ananya Rao',
        email: 'ananya.rao@acmebank.com',
        title: 'Access review workflow stuck at approver step (Q2 audit)',
        type: 'Account Access',
        description: 'Hi Support,\n\nWe’re running our quarterly access review and the workflow is stuck at the “Approver Review” step. The approver can open the task but the “Approve” button is disabled.\n\nDeadline: Today 6 PM.\nUsers impacted: 18.'
      },
      {
        name: 'John Miller',
        email: 'j.miller@fintech-solutions.io',
        title: 'Dashboard charts failing to render in Analytics module',
        type: 'Bug Report',
        description: 'Hello,\n\nSince this morning, the main analytics dashboard is showing "Error loading data" for all time-series charts. I have tried clearing my cache but the issue persists across different browsers.\n\nThis is impacting our weekly reporting.'
      },
      {
        name: 'Sarah Chen',
        email: 'sarah.c@global-logistics.com',
        title: 'Question regarding automated escalation rules',
        type: 'FAQ / General Question',
        description: 'Hi,\n\nI am trying to configure a new SLA policy and I need clarification on how the "Auto-escalation" trigger works when a ticket is in "Pending Customer" status. Does the timer pause or continue?\n\nThanks!'
      }
    ];

    const picked = samplePool[Math.floor(Math.random() * samplePool.length)];

    setFormData((prev) => ({
      ...prev,
      name: user?.name || prev.name || picked.name,
      email: user?.email || prev.email || picked.email,
      mobile: prev.mobile || '9876543210',
      product: productName || prev.product,
      module: moduleName || prev.module,
      issueType: picked.type,
      issueTypeOther: '',
      issueTitle: picked.title,
      description: picked.description
    }));

    const agents = managerMode?.agents || [];
    if (managerMode?.onAssignAgentChange && agents[0]) {
      managerMode.onAssignAgentChange(String(agents[0].id));
    }
  };

  const countrySelectStyles = {
    control: (base, state) => ({
      ...base,
      minHeight: 44,
      height: 44,
      minWidth: 124,
      maxWidth: 152,
      borderRadius: 10,
      borderColor: state.isFocused ? '#93c5fd' : '#e2e8f0',
      background: '#f5f7fa',
      boxShadow: 'none',
      fontSize: 13,
      cursor: 'pointer'
    }),
    valueContainer: (base) => ({ ...base, padding: '0 6px 0 8px', flexWrap: 'nowrap' }),
    singleValue: (base) => ({ ...base, margin: 0, fontSize: 13, maxWidth: '100%' }),
    indicatorsContainer: (base) => ({ ...base, height: 44, flexShrink: 0 }),
    dropdownIndicator: (base) => ({ ...base, color: '#64748b', padding: '0 6px' }),
    menu: (base) => ({ ...base, zIndex: 10001 }),
    menuPortal: (base) => ({ ...base, zIndex: 11000 }),
    menuList: (base) => ({ ...base, maxHeight: 280 }),
    option: (base, state) => ({
      ...base,
      fontSize: 13,
      backgroundColor: state.isFocused ? '#eff6ff' : '#fff'
    })
  };

  return (
    <div className="uf-modal" role="dialog" aria-labelledby="uf-modal-title">
      <button type="button" className="uf-close" onClick={closeForm} aria-label="Close">
        ×
      </button>
      <div className="uf-modal-scroll">
          <header className="uf-head">
            <h1 id="uf-modal-title" className="uf-title">Submit Your Query</h1>
            <p className="uf-subtitle">We&apos;re here to help! Please fill out the form below.</p>
          </header>

          <div className="uf-demo-row">
            <button type="button" className="uf-btn-demo-load" onClick={loadSampleData}>
              Load data
            </button>
            <span className="uf-demo-hint">Auto-fills all fields with a realistic example.</span>
          </div>

          <div className="uf-profile-strip">
            <div className="uf-profile-item">
              <div className="uf-profile-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
              </div>
              <div className="uf-profile-text">
                <span className="uf-profile-label">Username</span>
                <span className="uf-profile-value">{formData.name || '—'}</span>
              </div>
            </div>
            <div className="uf-profile-item">
              <div className="uf-profile-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>
              </div>
              <div className="uf-profile-text">
                <span className="uf-profile-label">Email</span>
                <span className="uf-profile-value">{formData.email || '—'}</span>
              </div>
            </div>
          </div>

        {submitStatus === 'success' && (
          <div className="uf-banner uf-banner--success">
            <h3 className="uf-banner-title">Ticket submitted successfully</h3>
            <p className="uf-banner-line"><strong>Ticket ID: #{ticketId}</strong></p>
            <p className="uf-banner-line">Thank you for contacting us. We&apos;ll review your query and get back to you soon.</p>
            <p className="uf-banner-note">Your ticket is now visible in &quot;Your Tickets &amp; Conversations&quot; below.</p>
            <div className="uf-banner-actions">
              <button type="button" className="uf-btn uf-btn-secondary" onClick={() => { setSubmitStatus(null); setTicketId(null); setReplies([]); }}>Submit another query</button>
              <button type="button" className="uf-btn uf-btn-primary" onClick={closeForm}>Close</button>
            </div>
          </div>
        )}

        {submitStatus === 'success' && replies.length > 0 && (
          <div className="uf-replies">
            <h3 className="uf-replies-title">Agent replies</h3>
            <ul className="uf-replies-list">
              {replies.map(reply => (
                <li key={reply.id} className="uf-reply-card">
                  <div className="uf-reply-meta">
                    <span className="uf-reply-agent">{reply.agent_name}</span>
                    <span className="uf-reply-date">{formatDateTimeIST(reply.sent_at)}</span>
                  </div>
                  <div className="uf-reply-body">{reply.message}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {submitStatus === 'error' && (
          <div className="uf-banner uf-banner--error">
            <h3 className="uf-banner-title">Something went wrong</h3>
            <p className="uf-banner-line">Please try again or contact support if the problem persists.</p>
            <button type="button" className="uf-btn uf-btn-primary" onClick={() => setSubmitStatus(null)}>Try again</button>
          </div>
        )}

        {!submitStatus && (
          <form onSubmit={handleSubmit} className="uf-form">
            {managerMode && (
              <div className="uf-field uf-field-full">
                <label className="uf-label" htmlFor="manager-assign-agent">Assign agent</label>
                <div className="uf-select-wrap">
                  <select
                    id="manager-assign-agent"
                    className="uf-select"
                    value={managerMode.assignAgentId || ''}
                    onChange={(e) => managerMode.onAssignAgentChange?.(e.target.value)}
                  >
                    <option value="">Select agent (optional)</option>
                    {managerAgentOptions.map((agent) => {
                      const availability = (agent.availability_status || 'available').toLowerCase();
                      const availabilityLabel =
                        availability === 'on_leave'
                          ? 'On Leave'
                          : availability === 'unavailable'
                            ? 'Unavailable'
                            : 'Available';
                      return (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} — {availabilityLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            )}
            <div className="uf-grid uf-grid-2">
              <div className="uf-field">
                <label className="uf-label" htmlFor="name">
                  Full name<span className="uf-req">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  className="uf-input"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  maxLength={30}
                  placeholder="Enter your full name"
                />
              </div>
              <div className="uf-field">
                <label className="uf-label" htmlFor="email">
                  Email address<span className="uf-req">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  className="uf-input"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  placeholder="Enter your email address"
                />
              </div>
            </div>

            <div className="uf-grid uf-grid-2">
              <div className="uf-field">
                <label className="uf-label" htmlFor="mobile">Mobile number</label>
                <div className="uf-phone-wrap">
                  <div className="uf-phone-prefix">
                    <ReactSelect
                      classNamePrefix="uf-country"
                      inputId="uf-country-code"
                      aria-label="Country calling code"
                      menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                      menuPosition="fixed"
                      options={countryOptions.map(opt => ({
                        value: opt.value,
                        label: (
                          <span className="uf-country-opt">
                            <ReactCountryFlag countryCode={opt.code} svg style={{ width: '1em', height: '1em', marginRight: 6 }} />
                            {opt.label} {opt.value}
                          </span>
                        ),
                        code: opt.code,
                        countryName: opt.label
                      }))}
                      value={{
                        value: countryCode.value,
                        label: (
                          <span className="uf-country-opt">
                            <ReactCountryFlag countryCode={countryCode.code} svg style={{ width: '1em', height: '1em', marginRight: 6 }} />
                            {countryCode.label} {countryCode.value}
                          </span>
                        )
                      }}
                      onChange={selected => setCountryCode(countryOptions.find(opt => opt.value === selected.value))}
                      styles={countrySelectStyles}
                      isSearchable
                      placeholder=""
                      noOptionsMessage={() => 'No countries found'}
                      filterOption={(option, inputValue) =>
                        option.data.countryName.toLowerCase().includes(inputValue.toLowerCase())
                      }
                    />
                  </div>
                  <input
                    type="tel"
                    id="mobile"
                    name="mobile"
                    className="uf-input uf-phone-input"
                    value={formData.mobile}
                    onChange={handleInputChange}
                    maxLength={15 - countryCode.value.length}
                    placeholder="Enter mobile number"
                  />
                </div>
              </div>
              <div className="uf-field">
                <label className="uf-label" htmlFor="product">
                  Select product<span className="uf-req">*</span>
                </label>
                <div className="uf-select-wrap">
                  <select
                    key={`product-${formData.product}-${products.length}`}
                    id="product"
                    name="product"
                    value={formData.product}
                    onChange={handleInputChange}
                    required
                    className="uf-select"
                    disabled={loadingProducts}
                  >
                    <option value="">{loadingProducts ? 'Loading products…' : 'Choose a product'}</option>
                    {products.map(product => (
                      <option key={product.id} value={product.name}>
                        {product.name}
                      </option>
                    ))}
                    {formData.product && !products.find(p => p.name === formData.product) && (
                      <option value={formData.product} disabled>
                        {formData.product}
                      </option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            <div className="uf-grid uf-grid-2">
              <div className="uf-field">
                <label className="uf-label" htmlFor="module">
                  Select module<span className="uf-req">*</span>
                </label>
                <div className="uf-select-wrap">
                  <select
                    id="module"
                    name="module"
                    value={formData.module}
                    onChange={handleInputChange}
                    required
                    className="uf-select"
                    disabled={loadingModules}
                  >
                    <option value="">{loadingModules ? 'Loading modules…' : 'Select a module'}</option>
                    {modules.map(module => (
                      <option key={module.id} value={module.name}>
                        {module.name}
                      </option>
                    ))}
                  </select>
                </div>
                {loadingModules && (
                  <p className="uf-hint">Loading modules for &quot;{formData.product}&quot;…</p>
                )}
                {!loadingModules && formData.product && modules.length === 0 && (
                  <p className="uf-hint uf-hint--warn">No modules found for &quot;{formData.product}&quot;</p>
                )}
              </div>
              <div className="uf-field">
                <label className="uf-label" htmlFor="issueType">
                  Select issue type<span className="uf-req">*</span>
                </label>
                <div className="uf-select-wrap">
                  <select
                    id="issueType"
                    name="issueType"
                    value={formData.issueType}
                    onChange={handleInputChange}
                    required
                    className="uf-select"
                  >
                    <option value="">Select an issue type</option>
                    {issueTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                {formData.issueType === 'Other' && (
                  <input
                    type="text"
                    name="issueTypeOther"
                    className="uf-input uf-other-issue"
                    value={formData.issueTypeOther}
                    onChange={handleInputChange}
                    maxLength={100}
                    placeholder="Please specify your issue"
                    required
                  />
                )}
              </div>
            </div>

            <div className="uf-grid uf-grid-2">
              <div className="uf-field">
                <label className="uf-label" htmlFor="issueTitle">
                  Issue title<span className="uf-req">*</span>
                </label>
                <input
                  type="text"
                  id="issueTitle"
                  name="issueTitle"
                  className="uf-input"
                  value={formData.issueTitle}
                  onChange={handleInputChange}
                  required
                  placeholder="Brief title for your issue"
                />
              </div>
              <div className="uf-field">
                <label className="uf-label" htmlFor="sla">SLA timer</label>
                <input
                  type="text"
                  id="sla"
                  name="sla"
                  className="uf-input uf-input-readonly"
                  value={selectedSLA || 'SLA will be assigned after ticket creation'}
                  readOnly
                  tabIndex={-1}
                />
              </div>
            </div>

            {String((products.find((p) => p.name === formData.product)?.priority_allocation_type) || 'ai_only').toLowerCase() === 'user_then_ai_verify' ? (
              <div className="uf-field uf-field-full">
                <label className="uf-label" htmlFor="user_selected_priority">
                  Priority<span className="uf-req">*</span>
                </label>
                <div className="uf-select-wrap">
                  <select
                    id="user_selected_priority"
                    name="user_selected_priority"
                    value={formData.user_selected_priority}
                    onChange={handleInputChange}
                    className="uf-select"
                    required
                  >
                    <option value="">Select priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <p className="uf-hint">Priority will be verified by AI. If it doesn’t match business impact, AI priority will be applied.</p>
              </div>
            ) : null}

            <div className="uf-field uf-field-full">
              <label className="uf-label" htmlFor="attachments">Attachments (up to 10 files, 5MB each)</label>
              <label className="uf-file-zone">
                <input
                  type="file"
                  id="attachments"
                  name="attachments"
                  className="uf-file-input"
                  accept="image/*,application/pdf,text/plain,.txt"
                  multiple
                  onChange={handleFilesChange}
                />
                <span className="uf-file-inner">
                  <svg className="uf-clip" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" /></svg>
                  <span className="uf-file-cta">Choose file</span>
                  <span className="uf-file-name">{attachments.length ? `${attachments.length} file(s) selected` : 'No files chosen'}</span>
                </span>
              </label>
              {attachments.length > 0 && (
                <div className="uf-attachments-list" role="list">
                  {attachments.map((f, idx) => (
                    <div key={`${f.name}-${f.size}-${f.lastModified}`} className="uf-attachment-item" role="listitem">
                      <span className="uf-attachment-name" title={f.name}>{f.name}</span>
                      <span className="uf-attachment-meta">{formatBytes(f.size)}</span>
                      <button
                        type="button"
                        className="uf-attachment-remove"
                        onClick={() => removeAttachment(idx)}
                        aria-label={`Remove ${f.name}`}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="uf-field uf-field-full">
              <label className="uf-label" htmlFor="description">
                Description<span className="uf-req">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                className="uf-textarea"
                value={formData.description}
                onChange={handleInputChange}
                required
                placeholder="Please describe your issue in detail..."
                rows={5}
              />
            </div>

            <div className="uf-actions">
              <button type="submit" className="uf-btn uf-btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting…' : 'Submit'}
              </button>
              <button type="button" className="uf-btn uf-btn-secondary" onClick={closeForm}>
                Cancel
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

export default UserForm; 