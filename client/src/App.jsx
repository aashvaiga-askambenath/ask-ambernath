import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, BadgeCheck, Bell, ChevronRight, Clock3, Droplets, Heart, Home, List, MapPin, Package,
  Phone, Plus, Search, Share2, ShieldCheck, ShoppingCart, SlidersHorizontal, Store, Trash2, User, Wrench, X,
} from 'lucide-react';
import {
  Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams,
} from 'react-router-dom';
import { api, supabase } from './api';
import { useAuth } from './AuthContext';
import { orderActionLabel } from './orderActions.mjs';
import './account.css';

const ToastContext = createContext(() => {});
const roleNames = { customer: 'Customer', business_owner: 'Business owner', admin: 'Administrator', super_admin: 'Super admin' };
const areas = ['Ambernath East', 'Ambernath West', 'Ambernath MIDC', 'Ambernath'];
const money = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const showToast = (message, tone = 'success') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3600);
  };
  return <ToastContext.Provider value={showToast}>{children}{toast && <div className={`toast ${toast.tone}`} role="status" aria-live="polite">{toast.message}</div>}</ToastContext.Provider>;
}
const useToast = () => useContext(ToastContext);

function useLoad(url, refresh = 0) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  useEffect(() => {
    let current = true;
    setState((old) => ({ ...old, loading: true, error: '' }));
    api.get(url).then((data) => {
      if (current) setState({ data, error: '', loading: false });
    }).catch((error) => {
      if (current) setState({ data: null, error: error.message, loading: false });
    });
    return () => { current = false; };
  }, [url, refresh]);
  return state;
}

function Shell({ children, pageClass = '' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cart, setCart] = useState(readCart);
  const cartCount = cart?.items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || 0;
  const checkoutPath = cart?.businessId ? `/checkout?business=${encodeURIComponent(cart.businessId)}` : '/checkout';
  const cartHref = user?.role === 'customer'
    ? checkoutPath
    : user ? '/explore' : `/auth?next=${encodeURIComponent(checkoutPath)}`;

  useEffect(() => {
    const updateCart = () => setCart(readCart());
    window.addEventListener('aa-cart-updated', updateCart);
    window.addEventListener('pageshow', updateCart);
    return () => {
      window.removeEventListener('aa-cart-updated', updateCart);
      window.removeEventListener('pageshow', updateCart);
    };
  }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/explore?q=${encodeURIComponent(query)}` : '/explore');
  };

  return <div className="app-wrap">
    <header className="topbar marketplace-header">
      <div className="header-primary-row">
        <Link to="/" className="brand" aria-label="Ask Ambernath home"><img src="/brand.svg" alt="" className="brand-logo"/><span>Ask <b>Ambernath</b></span></Link>
        <form className="marketplace-search" role="search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="header-search">Search local businesses and services in Ambernath</label>
          <input id="header-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find local businesses, services and more…" />
          <button type="submit" aria-label="Search"><Search size={17}/></button>
        </form>
        <div className="header-location" aria-label="Current location: Ambernath"><MapPin size={16}/><span>Ambernath</span></div>
        <div className="header-utilities">
          <Link className="header-icon-link cart-link" to={cartHref} aria-label={cartCount ? `Cart, ${cartCount} items` : 'Cart'}><ShoppingCart size={19}/>{cartCount > 0 && <span className="cart-count">{cartCount}</span>}</Link>
          {user ? <Link className="header-account" to="/account" aria-label={`Account: ${user.name || 'Account'}`}><User size={18}/><span>{user.name?.split(' ')[0] || 'Account'}</span></Link> : <Link className="header-account" to="/auth">Sign in</Link>}
        </div>
        <button className="mobile-nav-toggle" type="button" aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}><List size={20}/></button>
      </div>
      {mobileNavOpen && <nav className="header-navigation is-open" aria-label="Main navigation">
        <Link to="/" onClick={() => setMobileNavOpen(false)}>Home</Link>
        <Link to="/explore" onClick={() => setMobileNavOpen(false)}>Explore businesses</Link>
        <Link to="/ask" onClick={() => setMobileNavOpen(false)}>Ask Ambernath</Link>
      </nav>}
    </header>
    <main className={`page ${pageClass}`}>{children}</main>
    <nav className="bottom-nav" aria-label="Main navigation">
      <NavLink to="/" end><Home size={19}/><span>Home</span></NavLink>
      <NavLink to="/explore"><Search size={19}/><span>Explore</span></NavLink>
      <NavLink to="/ask"><span className="ask-pill">✦</span><span>Ask</span></NavLink>
      <NavLink to="/orders"><Package size={19}/><span>Orders</span></NavLink>
      <NavLink to="/account"><User size={19}/><span>Account</span></NavLink>
    </nav>
  </div>;
}

function Require({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Shell><Loading/></Shell>;
  if (!user) return <Navigate to="/auth" replace/>;
  if (roles && !roles.includes(user.role)) return <Shell><EmptyState title="Access restricted" text="Your account does not have access to this area."/></Shell>;
  return children;
}

function Loading({ label = 'Loading…' }) {
  return <div className="loading-state" role="status"><span className="spinner"/>{label}</div>;
}

function ErrorState({ message, retry }) {
  return <div className="empty error-state"><div className="empty-icon"><X size={25}/></div><h3>We couldn’t load this just yet</h3><p>{message}</p><button className="ghost-btn" onClick={retry || (() => window.location.reload())}>Try again</button></div>;
}

function EmptyState({ title, text, action }) {
  return <div className="empty"><div className="empty-icon"><Clock3 size={25}/></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function PageHead({ title, text, action }) {
  return <div className="page-head"><div><h1>{title}</h1>{text && <p>{text}</p>}</div>{action}</div>;
}

function CategoryIcon({ category }) {
  if ((category || '').toLowerCase().includes('water')) return <Droplets size={23}/>;
  if ((category || '').toLowerCase().includes('home') || (category || '').toLowerCase().includes('plumb')) return <Wrench size={23}/>;
  return <Store size={23}/>;
}

const CATEGORY_PHOTOS = {
  water: '/category-photos/water-supply.webp',
  'home-services': '/category-photos/home-services.webp',
  electrician: '/category-photos/electrician.webp',
  'ac-technician': '/category-photos/ac-technician.jpg',
  food: '/category-photos/tiffin-food.webp',
  tuition: '/category-photos/tuition.webp',
  travel: '/category-photos/travel-transport.webp',
  salon: '/category-photos/salon-wellness.webp',
  bakery: '/category-photos/bakery-cakes.webp',
  events: '/category-photos/events-decoration.webp',
  workshops: '/category-photos/workshops-manufacturing.webp',
  other: '/category-photos/other-services.webp',
  photography: '/category-photos/photography.webp',
  'graphic-and-advertising': '/category-photos/graphic-design.webp',
};
const CATEGORY_PHOTO_FALLBACK = '/category-photos/other-services.webp';

function CategoryPhoto({ category }) {
  const [hasImageError, setHasImageError] = useState(false);
  const imageSrc = hasImageError
    ? CATEGORY_PHOTO_FALLBACK
    : CATEGORY_PHOTOS[category.slug] || CATEGORY_PHOTO_FALLBACK;

  return <img
    src={imageSrc}
    alt={`${category.name} services`}
    width="58"
    height="58"
    loading="lazy"
    decoding="async"
    onError={() => setHasImageError(true)}
  />;
}

function HomePage() {
  const categoriesState = useLoad('/categories');
  const businessesState = useLoad('/businesses?limit=6');
  return <Shell>
    <section className="hero home-hero" aria-labelledby="home-hero-title">
      <div className="home-hero-copy">
        <h1 id="home-hero-title">
          <span>Shop Local</span>
          <span>Support Local</span>
          <span className="home-hero-accent">Grow Together <Heart size={23} aria-hidden="true"/></span>
        </h1>
        <p>Discover the best products, services &amp; local businesses from Ambernath – all in one place.</p>
      </div>
      <div className="home-hero-note" aria-hidden="true">
        <span>Local Business</span>
        <span>Local Growth</span>
        <Heart size={17}/>
      </div>
    </section>
    <section className="card overlap">
      <div className="section-head"><h2>Find what you need</h2><Link to="/explore">View all</Link></div>
      {categoriesState.loading ? <Loading label="Loading categories…"/> : categoriesState.error ? <ErrorState message={categoriesState.error}/> :
        categoriesState.data?.categories?.length ? <div className="cat-grid">{categoriesState.data.categories.slice(0, 8).map((category) =>
          <Link key={category.id} to={`/explore?cat=${encodeURIComponent(category.slug)}`} className="cat"><span><CategoryPhoto category={category}/></span><b>{category.name}</b></Link>)}</div> :
          <EmptyState title="New categories are on the way" text="We’re making room for more of Ambernath’s local businesses."/>}
    </section>
    <section className="section">
      <div className="section-head"><h2>Discover local businesses</h2><Link to="/explore">Explore all</Link></div>
      {businessesState.loading ? <Loading label="Finding local businesses…"/> : businessesState.error ? <ErrorState message={businessesState.error}/> :
        businessesState.data?.businesses?.length ? <div className="business-grid">{businessesState.data.businesses.map((business) => <BusinessCard key={business.id} business={business}/>)}</div> :
          <EmptyState title="A new local favourite starts here" text="There aren’t any businesses to feature just yet. Know a local provider? Invite them to join." action={<Link className="primary-btn" to="/list-business">List your business</Link>}/>}
    </section>
  </Shell>;
}

function BusinessCard({ business }) {
  return <Link to={`/business/${business.slug}`} className="biz-card">
    <div className="biz-icon">{business.logoUrl ? <img src={business.logoUrl} alt="" loading="lazy"/> : <CategoryIcon category={business.category}/>}</div>
    <div className="biz-main">
      <div className="biz-title"><h3>{business.name}</h3><span className={business.online ? 'online' : 'offline'}>{business.online ? 'Open now' : 'Closed'}</span></div>
      <p>{business.tagline || business.category}</p>
      <div className="biz-meta"><span>{business.area}</span>{business.ratingCount > 0 && <span>★ {business.averageRating.toFixed(1)} ({business.ratingCount})</span>}{business.priceFrom > 0 && <span>From {money(business.priceFrom)}</span>}</div>
    </div>
  </Link>;
}

function Explore() {
  const [params, setParams] = useSearchParams();
  const paramsKey = params.toString();
  const [offset, setOffset] = useState(0);
  const [allBusinesses, setAllBusinesses] = useState([]);
  const url = `/businesses?limit=50&offset=${offset}${params.get('cat') ? `&category=${encodeURIComponent(params.get('cat'))}` : ''}${params.get('q') ? `&q=${encodeURIComponent(params.get('q'))}` : ''}${params.get('area') ? `&area=${encodeURIComponent(params.get('area'))}` : ''}${params.get('sort') ? `&sort=${encodeURIComponent(params.get('sort'))}` : ''}`;
  const result = useLoad(url);
  const categories = useLoad('/categories');
  const [query, setQuery] = useState(params.get('q') || '');
  const [area, setArea] = useState(params.get('area') || '');
  useEffect(() => { setOffset(0); setAllBusinesses([]); }, [paramsKey]);
  useEffect(() => {
    if (result.data?.businesses && result.data.offset === offset) {
      setAllBusinesses((current) => offset === 0 ? result.data.businesses : [...current, ...result.data.businesses]);
    }
  }, [result.data, offset]);
  const search = (event) => {
    event.preventDefault();
    setOffset(0);
    setAllBusinesses([]);
    const next = new URLSearchParams(params);
    query.trim() ? next.set('q', query.trim()) : next.delete('q');
    area ? next.set('area', area) : next.delete('area');
    setParams(next);
  };
  return <Shell>
    <PageHead title="Explore Ambernath" text="Find verified local businesses, useful services and everyday essentials across town." action={<SlidersHorizontal size={22}/>} />
    <form className="filter-form card" onSubmit={search}>
      <label className="search-field"><Search size={18}/><input aria-label="Search businesses" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Business, service or area"/></label>
      <label className="sr-only" htmlFor="area-filter">Area</label><select id="area-filter" value={area} onChange={(event) => setArea(event.target.value)}><option value="">All Ambernath areas</option>{areas.map((item) => <option key={item}>{item}</option>)}</select>
      <label className="sr-only" htmlFor="sort-filter">Sort businesses</label><select id="sort-filter" value={params.get('sort') || 'relevance'} onChange={(event) => { const next = new URLSearchParams(params); next.set('sort', event.target.value); setParams(next); }}><option value="relevance">Relevance</option><option value="rating">Top rated</option><option value="price">Price</option></select>
      <button className="primary-btn" type="submit">Find businesses</button>
    </form>
    <div className="chip-row">{[['', 'All'], ...(categories.data?.categories || []).map((item) => [item.slug, item.name])].map(([slug, name]) =>
      <button key={slug} className={`chip ${params.get('cat') === slug ? 'active' : ''}`} onClick={() => { const next = new URLSearchParams(params); slug ? next.set('cat', slug) : next.delete('cat'); setParams(next); }}>{name}</button>)}</div>
    {result.loading && offset === 0 ? <Loading label="Finding local businesses…"/> : result.error ? <ErrorState message={result.error}/> :
      allBusinesses.length ? <><div className="business-grid">{allBusinesses.map((business) => <BusinessCard key={business.id} business={business}/>)}</div>
        {allBusinesses.length < (result.data?.total || 0) && <button className="ghost-btn load-more" disabled={result.loading} onClick={() => setOffset(allBusinesses.length)}>{result.loading ? 'Loading…' : 'Load more businesses'}</button>}</> :
        <EmptyState title="No matches this time" text="Try a different search or Ambernath area. We only show verified businesses that are currently available."/>}
  </Shell>;
}

function Ask() {
  const [text, setText] = useState('');
  const [businesses, setBusinesses] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await api.get(`/businesses?q=${encodeURIComponent(text.trim())}&sort=relevance`);
      setBusinesses(result.businesses);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <Shell>
    <PageHead title="Ask your neighbourhood" text="Tell us what you’re looking for. We’ll connect your request with verified local businesses."/>
    <form className="ask-box" onSubmit={submit}>
      <label htmlFor="local-search">What are you looking for?</label>
      <textarea id="local-search" value={text} onChange={(event) => setText(event.target.value)} maxLength={120} placeholder="For example: fresh tiffin delivery in Ambernath West"/>
      <div className="ask-footer"><span>{text.length}/120</span><button className="primary-btn" disabled={busy || !text.trim()}>{busy ? 'Searching…' : 'Find a local match'}</button></div>
    </form>
    {error && <ErrorState message={error}/>}
    {businesses && <section className="section"><div className="section-head"><h2>Made for your search</h2><span>{businesses.length} {businesses.length === 1 ? 'match' : 'matches'}</span></div>
      {businesses.length ? <div className="business-grid">{businesses.map((business) => <BusinessCard key={business.id} business={business}/>)}</div> :
        <EmptyState title="Nothing nearby matched that search" text="Try another service or browse verified local businesses by category." action={<Link className="ghost-btn" to="/explore">Explore businesses</Link>}/>}
    </section>}
  </Shell>;
}

function BusinessDetail() {
  const { slug } = useParams();
  const result = useLoad(`/businesses/${encodeURIComponent(slug)}`);
  const { user } = useAuth();
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const business = result.data?.business;
  useEffect(() => {
    if (user?.role !== 'customer' || !business) return;
    api.get('/favorites').then((data) => setSaved(data.businesses.some((item) => item.id === business.id))).catch(() => {});
  }, [business?.id, user?.id, user?.role]);
  const toggleFavorite = async () => {
    if (!user) return window.location.assign('/auth');
    try {
      if (saved) await api.delete(`/favorites/${business.id}`);
      else await api.post(`/favorites/${business.id}`, {});
      setSaved(!saved); toast(saved ? 'Removed from saved businesses' : 'Business saved');
    } catch (error) { toast(error.message, 'error'); }
  };
  const share = async () => {
    const shareData = { title: business.name, text: `${business.name} on Ask Ambernath`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(shareData.url); toast('Business link copied'); }
    } catch (error) { if (error.name !== 'AbortError') toast('Could not share this link', 'error'); }
  };
  if (result.loading) return <Shell><Loading/></Shell>;
  if (result.error) return <Shell><EmptyState title="This business page isn’t available" text={result.error} action={<Link className="ghost-btn" to="/explore">Explore businesses</Link>}/></Shell>;
  const whatsappDigits = business.whatsappPhone?.replace(/\D/g, '') || '';
  const whatsapp = whatsappDigits.length === 10 ? `91${whatsappDigits}` : whatsappDigits.startsWith('0') && whatsappDigits.length === 11 ? `91${whatsappDigits.slice(1)}` : whatsappDigits.length >= 11 && whatsappDigits.length <= 15 ? whatsappDigits : '';
  return <Shell>
    <Link className="back-btn" to="/explore"><ArrowLeft size={18}/> Explore</Link>
    <div className="detail-hero">
      <div className="detail-icon">{business.logoUrl ? <img src={business.logoUrl} alt={`${business.name} logo`}/> : <CategoryIcon category={business.category}/>}</div>
      <span className="online-badge"><BadgeCheck size={14}/> Verified · Open now</span>
      <h1>{business.name}</h1><p>{business.tagline}</p>
      <div className="biz-meta"><span>{business.category}</span><span><MapPin size={14}/> {business.area}</span>{business.ratingCount > 0 && <span>★ {business.averageRating.toFixed(1)} · {business.ratingCount} reviews</span>}</div>
      <div className="detail-actions">
        <a className="ghost-btn" href={`tel:${business.phone}`}><Phone size={15}/> Call business</a>
        {whatsapp && <a className="ghost-btn" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hi, I found ${business.name} on Ask Ambernath and would like to enquire.`)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        <button className="ghost-btn" onClick={share}><Share2 size={15}/> Share</button>
        {user?.role === 'customer' && <button className="ghost-btn" onClick={toggleFavorite}><Heart size={15} fill={saved ? 'currentColor' : 'none'}/>{saved ? 'Saved' : 'Save'}</button>}
      </div>
    </div>
    {(business.coverImageUrl || business.shopInsideImageUrl) && <section className="section shop-photo-grid" aria-label="Shop photos">
      {business.coverImageUrl && <figure className="card shop-photo"><img src={business.coverImageUrl} alt={`${business.name} shop from outside`}/><figcaption>Outside the shop</figcaption></figure>}
      {business.shopInsideImageUrl && <figure className="card shop-photo"><img src={business.shopInsideImageUrl} alt={`${business.name} shop interior`}/><figcaption>Inside the shop</figcaption></figure>}
    </section>}
    {business.description && <section className="section card content-card"><h2>About</h2><p>{business.description}</p><p><MapPin size={15}/> {business.address}, {business.area}, {business.city} {business.pincode}</p></section>}
    <section className="section">
      <div className="section-head"><h2>What they offer</h2></div>
      {business.services.length ? <div className="service-list">{business.services.map((service) =>
        <div key={service.id} className="service-row"><div className="service-info">{service.imageUrl && <img className="service-image" src={service.imageUrl} alt={`${service.name} service`}/>}<div><b>{service.name}</b><small>{service.description || service.unitLabel || 'Available from this business'}</small></div></div>
          <div className="service-price">{money(service.price)}<Link className="small-order" to={`/checkout?business=${business.id}&service=${service.id}`}>Add to order</Link></div></div>)}</div> :
        <EmptyState title="Services are being updated" text="Get in touch with the business to ask what’s currently available."/>}
    </section>
    {business.hours?.length > 0 && <section className="section card content-card"><h2>Business hours</h2>{business.hours.map((hour) => <p key={hour.day_of_week}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][hour.day_of_week]}: {hour.is_closed ? 'Closed' : `${hour.open_time} – ${hour.close_time}`}</p>)}</section>}
    {business.reviews?.length > 0 && <section className="section"><div className="section-head"><h2>Customer reviews</h2></div><div className="review-list">{business.reviews.map((review) => <article className="card review-card" key={review.id}><b>★ {review.rating}/5</b><p>{review.comment}</p><small>{review.profiles?.full_name || 'Customer'}</small></article>)}</div></section>}
  </Shell>;
}

const cartStorageKey = 'aa_cart_v1';
function readCart() {
  try { return JSON.parse(sessionStorage.getItem(cartStorageKey) || 'null'); } catch { return null; }
}
function Checkout() {
  const [params] = useSearchParams();
  const businessId = params.get('business');
  const initialCart = readCart();
  const [items, setItems] = useState(initialCart?.businessId === businessId ? initialCart.items : []);
  const [addresses, setAddresses] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', address: '', area: '', pincode: '', notes: '', paymentMethod: 'cash_on_service' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();
  const publicList = useLoad('/businesses?limit=50');
  const feeConfig = useLoad('/checkout-config');
  const business = publicList.data?.businesses?.find((entry) => entry.id === businessId);
  useEffect(() => { if (user) api.get('/addresses').then((data) => setAddresses(data.addresses)).catch(() => {}); }, [user?.id]);
  useEffect(() => {
    if (!businessId || !params.get('service')) return;
    const serviceId = params.get('service');
    const current = readCart();
    const cartItems = current?.businessId === businessId ? [...current.items] : [];
    const existing = cartItems.find((item) => item.serviceId === serviceId);
    if (existing) existing.quantity += 1;
    else cartItems.push({ serviceId, quantity: 1 });
    const cart = { businessId, items: cartItems, idempotencyKey: current?.businessId === businessId ? current.idempotencyKey || crypto.randomUUID() : crypto.randomUUID() };
    sessionStorage.setItem(cartStorageKey, JSON.stringify(cart));
    window.dispatchEvent(new Event('aa-cart-updated'));
    setItems(cartItems);
  }, [businessId, params]);
  if (!user) return <Navigate to="/auth?next=%2Fcheckout" replace/>;
  if (publicList.error) return <Shell><ErrorState message={publicList.error}/></Shell>;
  if (!publicList.loading && !businessId) return <Shell><EmptyState title="Your basket is ready for a business" text="Choose a service from a local business to begin checkout." action={<Link className="primary-btn" to="/explore">Explore businesses</Link>}/></Shell>;
  if (!publicList.loading && businessId && !business) return <Shell><EmptyState title="This business is no longer available" text="It may be offline or this service may have changed. Nothing has been submitted." action={<Link className="ghost-btn" to="/explore">Explore businesses</Link>}/></Shell>;
  if (!business) return <Shell><Loading label="Loading your order…"/></Shell>;
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const updateQuantity = (serviceId, increment) => {
    const next = items.map((item) => item.serviceId === serviceId ? { ...item, quantity: item.quantity + increment } : item).filter((item) => item.quantity > 0 && item.quantity <= 99);
    setItems(next);
    const current = readCart();
    sessionStorage.setItem(cartStorageKey, JSON.stringify({ businessId, items: next, idempotencyKey: current?.idempotencyKey || crypto.randomUUID() }));
    window.dispatchEvent(new Event('aa-cart-updated'));
  };
  const placeOrder = async (event) => {
    event.preventDefault();
    if (!items.length) { setError('Add at least one available service to your order.'); return; }
    if (form.address.trim().length < 5) { setError('Enter a complete service address.'); return; }
    setBusy(true); setError('');
    try {
      const result = await api.post('/orders', {
        businessId,
        items,
        customerName: form.name || user.name,
        customerPhone: form.phone || user.phone,
        deliveryAddress: { address_line_1: form.address, area: form.area || 'Ambernath', pincode: form.pincode },
        notes: form.notes,
        paymentMethod: form.paymentMethod,
        idempotencyKey: readCart()?.idempotencyKey || crypto.randomUUID(),
      });
      sessionStorage.removeItem(cartStorageKey);
      window.dispatchEvent(new Event('aa-cart-updated'));
      navigate(`/orders/${result.order.id}`, { state: { placed: true } });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const subtotal = items.reduce((sum, item) => {
    const service = business.services.find((entry) => entry.id === item.serviceId);
    return sum + (service ? service.price * item.quantity : 0);
  }, 0);
  const platformFee = feeConfig.data?.platformFee ?? 0;
  const deliveryFee = feeConfig.data?.deliveryFee ?? 0;
  return <Shell>
    <PageHead title="Complete your request" text={`Your order with ${business.name}`}/>
    <div className="checkout-grid"><form className="card checkout-form" onSubmit={placeOrder}>
      {!items.length && <EmptyState title="Nothing in your order yet" text="Choose a service from this business to continue." action={<Link className="ghost-btn" to={`/business/${business.slug}`}>View services</Link>}/>}
      {items.map((item) => {
        const service = business.services.find((entry) => entry.id === item.serviceId);
        return <div className="checkout-item" key={item.serviceId}>{service ?
          <><div><b>{service.name}</b><small>{money(service.price)} each</small></div><div className="qty"><button type="button" aria-label={`Remove one ${service.name}`} onClick={() => updateQuantity(item.serviceId, -1)}>−</button><span>{item.quantity}</span><button type="button" aria-label={`Add one ${service.name}`} onClick={() => updateQuantity(item.serviceId, 1)}>+</button></div></> :
          <><div><b>This service is no longer available</b><small>Remove it from your order to continue.</small></div><button type="button" className="ghost-btn" onClick={() => updateQuantity(item.serviceId, -item.quantity)}>Remove</button></>}
        </div>;
      })}
      <label>Your name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={user.name} maxLength={100}/></label>
      <label>Phone number<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder={user.phone || 'Your contact number'} required/></label>
      {addresses.length > 0 && <label>Saved address<select defaultValue="" onChange={(event) => { const address = addresses.find((entry) => entry.id === event.target.value); if (address) setForm({ ...form, address: address.address_line_1, area: address.area, pincode: address.pincode }); }}><option value="">Choose a saved address</option>{addresses.map((address) => <option value={address.id} key={address.id}>{address.label} · {address.area}</option>)}</select></label>}
      <label>Service address<textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required minLength={5} maxLength={500} placeholder="House / building, street and landmark"/></label>
      <div className="field-row"><label>Area<select value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })}><option value="">Select area</option>{areas.map((area) => <option key={area}>{area}</option>)}</select></label><label>PIN code<input inputMode="numeric" value={form.pincode} onChange={(event) => setForm({ ...form, pincode: event.target.value })} pattern="[0-9]{6}" maxLength={6}/></label></div>
      <label>A note for the business (optional)<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={1000} placeholder="Anything the business should know?"/></label>
      <label>Payment method<select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}><option value="cash_on_service">Cash on service</option><option value="upi_on_service">UPI on service</option></select></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-btn wide" disabled={busy || !items.length || feeConfig.loading || Boolean(feeConfig.error)}>{busy ? 'Placing order…' : 'Place order'}</button>
    </form><aside className="card summary"><h3>Order summary</h3><div><span>Services ({totalQuantity})</span><b>{money(subtotal)}</b></div>
      {feeConfig.loading ? <p className="muted-note">Loading applicable fees…</p> : feeConfig.error ? <p className="form-error" role="alert">Fees couldn’t be confirmed. Try again before placing your order.</p> : <>
        <div><span>Platform fee</span><b>{money(platformFee)}</b></div><div><span>Delivery fee</span><b>{money(deliveryFee)}</b></div>
        <p className="muted-note">Your total includes the fees shown above. Payment is made to the business using your selected method after your request is accepted.</p>
        <hr/><div className="summary-total"><span>Total</span><b>{money(subtotal + platformFee + deliveryFee)}</b></div>
      </>}
    </aside></div>
  </Shell>;
}

function Orders() {
  const { user } = useAuth();
  const path = user?.role === 'business_owner' ? '/orders/business' : ['admin', 'super_admin'].includes(user?.role) ? '/orders/admin' : '/orders/my';
  const result = useLoad(path);
  return <Shell><PageHead title={user?.role === 'business_owner' ? 'Customer requests' : 'Your orders'} text="A clear view of every booking and its latest update."/>
    {result.loading ? <Loading/> : result.error ? <ErrorState message={result.error}/> : result.data?.orders?.length ?
      <div className="order-list">{result.data.orders.map((order) => <OrderCard key={order.id} order={order}/>)}</div> :
      <EmptyState title="Your next order starts nearby" text="Once you place or receive a booking, you’ll find every update here." action={<Link className="primary-btn" to="/explore">Discover local businesses</Link>}/>}
  </Shell>;
}

function OrderCard({ order }) {
  return <Link className="order-card" to={`/orders/${order.id}`}><div><b>{order.orderNumber}</b><p>{order.businessName}</p><small>{new Date(order.createdAt).toLocaleString()}</small></div><div className="order-right"><span className={`status status-${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span><b>{money(order.total)}</b></div><ChevronRight size={17}/></Link>;
}

function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [refresh, setRefresh] = useState(0);
  const result = useLoad(`/orders/${encodeURIComponent(id)}`, refresh);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const toast = useToast();
  const order = result.data?.order;
  const ownerActions = { Pending: ['Accepted', 'Rejected'], Accepted: ['Preparing', 'Scheduled', 'Cancelled'], Preparing: ['Out for Delivery', 'Completed'], Scheduled: ['In Progress', 'Cancelled'], 'In Progress': ['Completed', 'Cancelled'], 'Out for Delivery': ['Completed', 'Cancelled'] };
  const actions = user?.role === 'customer' ? (order?.status === 'Pending' ? ['Cancelled'] : []) : ownerActions[order?.status] || [];
  const changeStatus = async (status) => {
    setBusy(true);
    try { await api.patch(`/orders/${order.id}/status`, { status }); setRefresh((value) => value + 1); toast(`Order ${status.toLowerCase()}`); }
    catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  const submitReview = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await api.post('/reviews', { orderId: order.id, businessId: order.businessId, rating, comment }); setReviewed(true); toast('Review submitted'); }
    catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  if (result.loading) return <Shell><Loading/></Shell>;
  if (result.error) return <Shell><EmptyState title="Order unavailable" text={result.error} action={<Link className="ghost-btn" to="/orders">Back to orders</Link>}/></Shell>;
  return <Shell><Link className="back-btn" to="/orders"><ArrowLeft size={18}/> Orders</Link><PageHead title={order.orderNumber} text={order.businessName}/>
    <div className="card order-detail-card"><div className="section-head"><h2>Order status</h2><span className={`status status-${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span></div>
      <p>Placed {new Date(order.createdAt).toLocaleString()}</p>
      <div className="timeline">{order.events.map((event, index) => <div key={`${event.createdAt}-${index}`} className="timeline-item"><span className="timeline-dot"/><div><b>{event.status}</b><small>{new Date(event.createdAt).toLocaleString()}</small>{event.note && <p>{event.note}</p>}</div></div>)}</div>
      <h3>Items</h3>{order.items.map((item) => <div className="line" key={item.id}><span>{item.itemName} × {item.quantity}</span><b>{money(item.lineTotal)}</b></div>)}
      <div className="summary-total"><span>Total</span><b>{money(order.total)}</b></div>
      <p className="muted-note">{order.paymentMethod === 'upi_on_service' ? 'UPI on service' : 'Cash on service'} · Payment is collected by the business at service time.</p>
      {actions.length > 0 && <div className="action-row">{actions.map((status) => <button key={status} className={status === 'Rejected' || status === 'Cancelled' ? 'danger-btn' : 'primary-btn'} disabled={busy} onClick={() => changeStatus(status)}>{orderActionLabel(user?.role, status)}</button>)}</div>}
      {order.status === 'Completed' && user?.role === 'customer' && !reviewed && !order.hasReview && <form className="review-form" onSubmit={submitReview}><h3>How was your experience?</h3><label>Rating<select value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5,4,3,2,1].map((value) => <option value={value} key={value}>{value} out of 5</option>)}</select></label><label>Share a few details (optional)<textarea maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What stood out to you?"/></label><button className="primary-btn" disabled={busy}>Share your review</button></form>}
      {(reviewed || order.hasReview) && <p role="status" className="muted-note">Thank you for sharing your experience.</p>}
      {order.status === 'Completed' && user?.role === 'customer' && <button className="ghost-btn reorder" onClick={() => {
        const items = order.items.filter((item) => item.serviceId).map((item) => ({ serviceId: item.serviceId, quantity: item.quantity }));
        if (!items.length) { toast('The original services are no longer available to reorder.', 'error'); return; }
        sessionStorage.setItem(cartStorageKey, JSON.stringify({ businessId: order.businessId, items, idempotencyKey: crypto.randomUUID() }));
        window.dispatchEvent(new Event('aa-cart-updated'));
        navigate(`/checkout?business=${order.businessId}`);
      }}>Book these services again</button>}
    </div>
  </Shell>;
}

function AuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, login, register, resetPassword, updatePassword } = useAuth();
  const initialMode = params.get('mode') || 'login';
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'customer' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user && mode !== 'update-password') return <Navigate to="/account" replace/>;
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (mode === 'login') { await login(form.email, form.password); navigate(params.get('next') || '/account'); }
      else if (mode === 'signup') {
        const result = await register(form);
        if (result.needsEmailConfirmation) { setMode('confirm'); return; }
        navigate(form.role === 'business_owner' ? '/business' : '/account');
      } else if (mode === 'forgot') { await resetPassword(form.email); setMode('sent'); }
      else if (mode === 'update-password') { await updatePassword(form.password); toast('Password updated'); navigate('/account'); }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const heading = { login: 'Welcome back', signup: 'Join your neighbourhood', forgot: 'Reset your password', sent: 'Check your inbox', confirm: 'Verify your email', 'update-password': 'Choose a new password' }[mode] || 'Sign in';
  return <Shell><div className="auth-wrap"><div className="auth-brand"><span className="brand-dot">A</span><span>Ask <b>Ambernath</b></span></div><h1>{heading}</h1>
    {mode === 'confirm' || mode === 'sent' ? <><p className="muted-note">If that address is linked to an account, you’ll find the next steps in your inbox shortly.</p><button className="ghost-btn" onClick={() => setMode('login')}>Return to sign in</button></> :
      <form className="card auth-form" onSubmit={submit}>
        {mode === 'signup' && <><label>Your name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} minLength={2} maxLength={100}/></label><label>Phone number<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={20}/></label><label>I’m here as<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="customer">Customer</option><option value="business_owner">Business owner</option></select></label></>}
        {mode !== 'update-password' && <label>Email<input type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={254}/></label>}
        {mode !== 'forgot' && <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })}/></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-btn wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset email' : 'Update password'}</button>
        {mode === 'login' && <button type="button" className="text-button" onClick={() => setMode('forgot')}>Forgot password?</button>}
        {(mode === 'login' || mode === 'signup') && <button type="button" className="text-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? 'New around here? Create an account' : 'Already have an account? Sign in'}</button>}
      </form>}
    <p className="muted-note">By continuing, you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</p>
  </div></Shell>;
}

function Account() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!user) return <Shell><PageHead title="Your account" text="Sign in to revisit your orders, addresses and saved businesses."/><Link className="primary-btn" to="/auth">Sign in or create an account</Link></Shell>;
  const signOut = async () => { setBusy(true); try { await logout(); } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); } };
  const links = [
    ['/account/profile', 'Profile & contact details', User], ['/account/security', 'Password & security', ShieldCheck],
    ['/orders', 'Orders & bookings', Package], ['/account/addresses', 'Your addresses', MapPin],
    ['/account/favorites', 'Saved businesses', Heart], ['/account/notifications', 'Updates', Bell],
    ...(user.role === 'business_owner' ? [['/business', 'Business studio', Store]] : []),
    ...(['admin', 'super_admin'].includes(user.role) ? [['/admin', 'Platform overview', ShieldCheck]] : []),
  ];
  return <Shell><div className="account-hero"><div className="avatar">{user.name?.charAt(0) || 'A'}</div><div><h1>{user.name}</h1><p>{user.email}</p><span className="role-label">{roleNames[user.role]}</span></div></div>
    <div className="menu-list">{links.map(([to, title, Icon]) => <Link key={to} to={to}><Icon size={18}/><span>{title}</span><ChevronRight size={16}/></Link>)}
      <Link to="/support"><Phone size={18}/><span>Talk to our team</span><ChevronRight size={16}/></Link>
      <button disabled={busy} onClick={signOut}><span>Sign out</span><ChevronRight size={16}/></button>
    </div>
    <div className="legal-links"><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/cancellation">Cancellation policy</Link></div>
  </Shell>;
}

function DeleteAccountDialog({ onClose, onDelete, onDeleted }) {
  const dialogRef = useRef(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await onDelete(confirmation);
      onDeleted(result.signOutError);
    } catch (deleteError) {
      setError(deleteError.message);
      setBusy(false);
    }
  };

  return <dialog
    className="delete-account-dialog"
    ref={dialogRef}
    aria-labelledby="delete-account-title"
    aria-describedby="delete-account-warning"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
  >
    <form onSubmit={submit}>
      <h2 id="delete-account-title">Delete your account?</h2>
      <p id="delete-account-warning">This action is irreversible. Your profile, sign-in credentials, saved items, and customer order/review data will be deleted. Any business listing will be taken offline, and historical order records may remain.</p>
      <p>Business-owner accounts cannot be deleted while active orders or payment processing are pending. Resolve them first or contact support.</p>
      <label htmlFor="delete-account-confirmation">Type DELETE to confirm</label>
      <input
        id="delete-account-confirmation"
        autoFocus
        autoComplete="off"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        required
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="delete-account-actions">
        <button type="button" className="ghost-btn" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="danger-btn" disabled={busy || confirmation !== 'DELETE'}>
          {busy ? 'Deleting…' : 'Permanently delete'}
        </button>
      </div>
    </form>
  </dialog>;
}

function AddressBook() {
  const [refresh, setRefresh] = useState(0);
  const result = useLoad('/addresses', refresh);
  const [form, setForm] = useState({ label: 'Home', recipient_name: '', phone: '', address_line_1: '', area: '', city: 'Ambernath', pincode: '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await api.post('/addresses', form); setRefresh((value) => value + 1); setForm({ ...form, recipient_name: '', phone: '', address_line_1: '', pincode: '' }); toast('Address saved'); }
    catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async (id) => { try { await api.delete(`/addresses/${id}`); setRefresh((value) => value + 1); toast('Address removed'); } catch (error) { toast(error.message, 'error'); } };
  return <Shell><PageHead title="Your addresses" text="Keep the places you use for local services close at hand."/>
    {result.loading ? <Loading/> : result.error ? <ErrorState message={result.error}/> : result.data?.addresses?.map((address) => <div className="card address-card" key={address.id}><b>{address.label}</b><p>{address.address_line_1}, {address.area} {address.pincode}</p><button className="text-button danger-text" onClick={() => remove(address.id)}>Remove</button></div>)}
    <form className="card auth-form" onSubmit={save}><h2>Add a new address</h2>
      {Object.entries({ label: 'Label', recipient_name: 'Recipient name', phone: 'Phone', address_line_1: 'Address', area: 'Area', pincode: 'PIN code' }).map(([key, label]) => <label key={key}>{label}<input required value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} maxLength={200}/></label>)}
      <button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
    </form>
  </Shell>;
}

function ProfileSettings() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({ fullName: user.name || '', phone: user.phone || '' });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await updateProfile(form); toast('Profile updated'); } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  return <Shell><PageHead title="Profile & contact details" text="Make sure your details are ready when a local business needs to reach you."/><form className="card auth-form" onSubmit={save}><label>Name<input required minLength={2} maxLength={100} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })}/></label><label>Email<input value={user.email} disabled/><small>Your sign-in email is managed securely through Supabase Auth.</small></label><label>Phone<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label><button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></form></Shell>;
}

function PasswordSettings() {
  const { user, updatePassword, deleteAccount } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const save = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await updatePassword(password); setPassword(''); toast('Password updated'); } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  return <Shell>
    <PageHead title="Password & security" text="Keep your account protected and in your control."/>
    <section className="security-section">
      <h2>Update your password</h2>
      <p>Choose a new password with at least 8 characters.</p>
      <form className="card auth-form" onSubmit={save}>
        <label>New password<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>
        <button className="primary-btn" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button>
      </form>
    </section>
    {['customer', 'business_owner'].includes(user?.role) && <section className="delete-account-section" aria-labelledby="delete-account-section-title">
      <div>
        <span className="delete-account-eyebrow">ACCOUNT CONTROL</span>
        <h2 id="delete-account-section-title">Delete account</h2>
        <p>This permanently deletes your sign-in and personal account data. Business listings will be taken offline; some historical order records may remain.</p>
      </div>
      <button className="danger-btn" onClick={() => setDeleteDialogOpen(true)}><Trash2 size={17}/> Delete account</button>
    </section>}
    {deleteDialogOpen && <DeleteAccountDialog
      onClose={() => setDeleteDialogOpen(false)}
      onDelete={deleteAccount}
      onDeleted={(signOutError) => {
        setDeleteDialogOpen(false);
        navigate('/', { replace: true });
        toast(signOutError ? `Account deleted, but local sign-out needs attention: ${signOutError}` : 'Your account has been deleted.', signOutError ? 'error' : 'success');
      }}
    />}
  </Shell>;
}

function Favorites() {
  const result = useLoad('/favorites');
  return <Shell><PageHead title="Saved businesses" text="The local businesses you’ve kept close for another day."/>
    {result.loading ? <Loading/> : result.error ? <ErrorState message={result.error}/> : result.data?.businesses?.length ?
      <div className="business-grid">{result.data.businesses.map((business) => <BusinessCard business={business} key={business.id}/>)}</div> :
      <EmptyState title="Make room for local favourites" text="Save a business from its page and it’ll be waiting here when you need it." action={<Link className="primary-btn" to="/explore">Discover businesses</Link>}/>}
  </Shell>;
}

function Notifications() {
  const result = useLoad('/notifications');
  const toast = useToast();
  const markRead = async (id) => { try { await api.patch(`/notifications/${id}/read`, {}); toast('Update marked as read'); } catch (error) { toast(error.message, 'error'); } };
  return <Shell><PageHead title="Your updates" text="The latest news about your orders and local businesses."/>
    {result.loading ? <Loading/> : result.error ? <ErrorState message={result.error}/> : result.data?.notifications?.length ?
      <div className="notification-list">{result.data.notifications.map((item) => <article className={`card notification-card ${item.read_at ? 'is-read' : ''}`} key={item.id}><b>{item.title}</b><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString()}</small>{!item.read_at && <button className="text-button" onClick={() => markRead(item.id)}>Mark as read</button>}</article>)}</div> :
      <EmptyState title="You’re all caught up" text="New order and account updates will find you here."/>}
  </Shell>;
}

function ListBusiness() {
  const { user } = useAuth();
  const categories = useLoad('/categories');
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '', categoryId: '', phone: user?.phone || '', whatsappPhone: '', email: user?.email || '',
    tagline: '', description: '', addressLine: '', area: '', pincode: '', services: [{ name: '', price: 0 }],
  });
  if (!user) return <Navigate to="/auth?next=%2Flist-business" replace/>;
  const setService = (index, key, value) => setForm((old) => ({ ...old, services: old.services.map((service, i) => i === index ? { ...service, [key]: value } : service) }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      await api.post('/businesses', { ...form, services: form.services.filter((service) => service.name.trim()).map((service) => ({ ...service, price: Number(service.price) })) });
      toast('Business submitted for verification'); navigate('/business');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  return <Shell><PageHead title="Bring your business to Ambernath" text="Create your local listing. It will become visible to customers after verification."/>
    {categories.error ? <ErrorState message={categories.error}/> : categories.loading ? <Loading label="Loading business categories…"/> :
      <form className="card onboarding-form" onSubmit={submit}>
        <div className="form-section"><h2>Tell us about your business</h2>
          <label>Business name<input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
          <label>Category<select required value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">Choose a category</option>{categories.data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>One-line introduction<input maxLength={180} value={form.tagline} onChange={(event) => setForm({ ...form, tagline: event.target.value })} placeholder="What makes your business special?"/></label>
          <label>Your story<textarea maxLength={3000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Share what you offer and who you serve."/></label>
        </div>
        <div className="form-section"><h2>Where to find you</h2>
          <div className="field-row"><label>Phone<input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label><label>WhatsApp (optional)<input type="tel" value={form.whatsappPhone} onChange={(event) => setForm({ ...form, whatsappPhone: event.target.value })}/></label></div>
          <label>Contact email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label>
          <label>Address<input required minLength={4} value={form.addressLine} onChange={(event) => setForm({ ...form, addressLine: event.target.value })}/></label>
          <div className="field-row"><label>Area<input required value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} placeholder="Ambernath East / West / MIDC"/></label><label>PIN code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={form.pincode} onChange={(event) => setForm({ ...form, pincode: event.target.value })}/></label></div>
        </div>
        <div className="form-section"><h2>Your services & starting prices</h2>{form.services.map((service, index) => <div className="field-row service-edit" key={index}><label>Service<input required={index === 0} value={service.name} onChange={(event) => setService(index, 'name', event.target.value)}/></label><label>Price in ₹<input type="number" min="0" max="1000000" required value={service.price} onChange={(event) => setService(index, 'price', event.target.value)}/></label>{form.services.length > 1 && <button className="ghost-btn" type="button" aria-label="Remove service" onClick={() => setForm({ ...form, services: form.services.filter((_, i) => i !== index) })}><X size={16}/></button>}</div>)}
          <button type="button" className="ghost-btn" onClick={() => setForm({ ...form, services: [...form.services, { name: '', price: 0 }] })}><Plus size={16}/> Add service</button>
        </div>
        <p className="muted-note">By continuing, you confirm that your business and contact details are accurate. You can add verification documents from your business dashboard.</p>
        <button className="primary-btn" disabled={busy}>{busy ? 'Submitting…' : 'Send for verification'}</button>
      </form>}
  </Shell>;
}

function BusinessPortal() {
  const [businessId, setBusinessId] = useState('');
  const [refresh, setRefresh] = useState(0);
  const businesses = useLoad('/owner/businesses', refresh);
  const orders = useLoad('/orders/business', refresh);
  const toast = useToast();
  useEffect(() => { if (!businessId && businesses.data?.businesses?.length) setBusinessId(businesses.data.businesses[0].id); }, [businesses.data, businessId]);
  const business = businesses.data?.businesses?.find((item) => item.id === businessId);
  const myOrders = (orders.data?.orders || []).filter((item) => item.businessId === businessId);
  const setOnline = async (online) => {
    try { await api.patch(`/owner/businesses/${business.id}/online`, { online }); setRefresh((value) => value + 1); toast(online ? 'Business is online' : 'Business is offline'); }
    catch (error) { toast(error.message, 'error'); }
  };
  return <Shell><PageHead title="Your business studio" text="Shape your listing, manage services and stay on top of customer requests." action={<Link className="primary-btn" to="/list-business">Add a business</Link>}/>
    {businesses.loading ? <Loading/> : businesses.error ? <ErrorState message={businesses.error}/> : !businesses.data.businesses.length ?
      <EmptyState title="Make your business part of Ambernath" text="Create a listing to begin the verification process and meet local customers." action={<Link className="primary-btn" to="/list-business">Create a business listing</Link>}/> :
      <>
        {businesses.data.businesses.length > 1 && <label className="business-select">Selected business<select value={businessId} onChange={(event) => setBusinessId(event.target.value)}>{businesses.data.businesses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {business && <><div className="card owner-business-card"><div><span className={`status status-${business.verificationStatus?.toLowerCase().replaceAll(' ', '-')}`}>{business.verificationStatus}</span><h2>{business.name}</h2><p>{business.tagline || business.area}</p></div><div className="online-control"><span>{business.online ? 'Online' : 'Offline'}</span><button disabled={business.verificationStatus !== 'verified' || (!business.isActive && !business.online)} className={`switch ${business.online ? 'is-on' : ''}`} role="switch" aria-checked={business.online} aria-label="Business online status" onClick={() => setOnline(!business.online)}><span/></button></div></div>
          {business.verificationStatus === 'verified' && !business.online && business.isActive && <div className="card publish-hint"><p>Your listing is verified and ready. Make it visible to customers across search and the homepage.</p><button className="primary-btn" onClick={() => setOnline(true)}>Make listing visible</button></div>}
          {business.verificationStatus === 'verified' && !business.isActive && <p className="muted-note">This listing is currently disabled and can’t be published. Contact support for help.</p>}
          <BusinessUploads business={business}/>
          <div className="stats-grid"><Stat title="Orders received" value={myOrders.length}/><Stat title="Pending" value={myOrders.filter((item) => item.status === 'Pending').length}/><Stat title="Completed" value={myOrders.filter((item) => item.status === 'Completed').length}/><Stat title="Completed revenue" value={money(myOrders.filter((item) => item.status === 'Completed').reduce((sum, item) => sum + item.total, 0))}/></div>
          <section className="section"><div className="section-head"><h2>Services</h2></div><div className="service-list">{business.services.map((service) => <OwnerServiceEdit businessId={business.id} service={service} key={service.id} onSaved={() => setRefresh((value) => value + 1)}/>)}</div><NewOwnerService businessId={business.id} onSaved={() => setRefresh((value) => value + 1)}/></section>
          <BusinessHoursEditor business={business} onSaved={() => setRefresh((value) => value + 1)}/>
          <section className="section"><div className="section-head"><h2>Customer requests</h2><Link to="/orders">View all</Link></div>{orders.loading ? <Loading/> : orders.error ? <ErrorState message={orders.error}/> : myOrders.length ? <div className="order-list">{myOrders.slice(0, 10).map((order) => <OrderCard key={order.id} order={order}/>)}</div> : <EmptyState title="Your next customer is on the way" text="New bookings will appear here as soon as customers find your business."/>}</section>
        </>}
      </>}
  </Shell>;
}

function Stat({ title, value }) { return <div className="card stat-card"><span>{title}</span><b>{value}</b></div>; }

function OwnerServiceEdit({ businessId, service, onSaved }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(service.name);
  const [price, setPrice] = useState(service.price);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadServiceImage(businessId, service.id, file);
      onSaved();
      toast('Service photo uploaded');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  const save = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await api.patch(`/owner/services/${service.id}`, { name, price: Number(price) }); onSaved(); setOpen(false); toast('Service updated'); }
    catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  const toggle = async () => {
    setBusy(true);
    try { await api.patch(`/owner/services/${service.id}`, { isAvailable: !service.isAvailable }); onSaved(); }
    catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  return <div className="owner-service"><div className="service-row"><div className="service-info">{service.imageUrl && <img className="service-image" src={service.imageUrl} alt={`${service.name} service`}/>}<div><b>{service.name}</b><small>{service.isAvailable ? 'Available' : 'Paused'}</small><label className="service-photo-control">{service.imageUrl ? 'Change photo' : 'Add service photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }}/></label></div></div><div className="service-price">{money(service.price)}<button className="small-order text-button" disabled={busy} onClick={toggle}>{service.isAvailable ? 'Pause' : 'Make available'}</button><button className="small-order text-button" disabled={busy} onClick={() => setOpen(!open)}>{open ? 'Close edit' : 'Edit price'}</button></div></div>
    {open && <form className="inline-form service-inline" onSubmit={save}><label>Service name<input required value={name} onChange={(event) => setName(event.target.value)}/></label><label>Price in ₹<input required type="number" min="0" max="1000000" value={price} onChange={(event) => setPrice(event.target.value)}/></label><button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></form>}
  </div>;
}

async function uploadServiceImage(businessId, serviceId, file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG, or WebP image under 5 MB.');
  }
  if (!supabase) throw new Error('Supabase storage is not configured yet.');
  const details = await api.post(`/owner/businesses/${businessId}/upload`, {
    fileName: file.name, contentType: file.type, size: file.size, documentType: 'service', serviceId,
  });
  const { error } = await supabase.storage.from(details.bucket)
    .uploadToSignedUrl(details.path, details.token, file, { contentType: file.type });
  if (error) throw error;
}

function NewOwnerService({ businessId, onSaved }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const create = async (event) => {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api.post(`/owner/businesses/${businessId}/services`, { name, price: Number(price) });
      setName(''); setPrice('');
      if (photo) {
        try {
          await uploadServiceImage(businessId, result.service.id, photo);
        } catch (error) {
          setPhoto(null); onSaved(); toast(`Service added, but its photo could not be uploaded: ${error.message}`, 'error'); return;
        }
      }
      setPhoto(null); onSaved(); toast('Service added');
    }
    catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  return <form className="card inline-form" onSubmit={create}><label>Add service<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)}/></label><label>Price in ₹<input type="number" required min="0" max="1000000" value={price} onChange={(event) => setPrice(event.target.value)}/></label><label>Service photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => setPhoto(event.target.files?.[0] || null)}/></label><button className="primary-btn" disabled={busy}>{busy ? 'Adding…' : 'Add service'}</button></form>;
}

function BusinessHoursEditor({ business, onSaved }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState([]);
  const toast = useToast();
  useEffect(() => {
    const savedHours = new Map((business.hours || []).map((hour) => [hour.day_of_week, hour]));
    setHours(Array.from({ length: 7 }, (_, dayOfWeek) => {
      const hour = savedHours.get(dayOfWeek);
      return { dayOfWeek, isClosed: hour?.is_closed ?? true, openTime: hour?.open_time?.slice(0, 5) || '09:00', closeTime: hour?.close_time?.slice(0, 5) || '18:00' };
    }));
  }, [business.id, business.hours]);
  const save = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await api.put(`/owner/businesses/${business.id}/hours`, { hours }); onSaved(); setOpen(false); toast('Business hours saved'); }
    catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  return <section className="section"><div className="section-head"><h2>Business hours</h2><button className="ghost-btn" onClick={() => setOpen(!open)}>{open ? 'Cancel' : 'Edit hours'}</button></div>
    {open && <form className="card hours-form" onSubmit={save}>{hours.map((hour) => <div className="hours-row" key={hour.dayOfWeek}><b>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][hour.dayOfWeek]}</b><label className="check-label"><input type="checkbox" checked={hour.isClosed} onChange={(event) => setHours((old) => old.map((item) => item.dayOfWeek === hour.dayOfWeek ? { ...item, isClosed: event.target.checked } : item))}/> Closed</label>{!hour.isClosed && <><label>Opens<input type="time" required value={hour.openTime} onChange={(event) => setHours((old) => old.map((item) => item.dayOfWeek === hour.dayOfWeek ? { ...item, openTime: event.target.value } : item))}/></label><label>Closes<input type="time" required value={hour.closeTime} onChange={(event) => setHours((old) => old.map((item) => item.dayOfWeek === hour.dayOfWeek ? { ...item, closeTime: event.target.value } : item))}/></label></>}</div>)}<button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save hours'}</button></form>}
  </section>;
}

function Admin() {
  const [refresh, setRefresh] = useState(0);
  const metrics = useLoad('/admin/metrics', refresh);
  const businesses = useLoad('/admin/businesses', refresh);
  const orders = useLoad('/orders/admin', refresh);
  const [tab, setTab] = useState('businesses');
  const [filter, setFilter] = useState('');
  const toast = useToast();
  const moderation = async (business, verificationStatus) => {
    try {
      await api.patch(`/admin/businesses/${business.id}/verification`, { verificationStatus });
      setRefresh((value) => value + 1);
      toast(verificationStatus === 'verified' ? 'Business verified and published' : `Business ${verificationStatus}`);
    }
    catch (error) { toast(error.message, 'error'); }
  };
  const filtered = (businesses.data?.businesses || []).filter((item) => !filter || item.name.toLowerCase().includes(filter.toLowerCase()) || item.verificationStatus === filter);
  return <Shell><PageHead title="Platform overview" text="A considered view of Ambernath’s marketplace, providers and customer activity."/>
    {metrics.error ? <ErrorState message={metrics.error}/> : metrics.loading ? <Loading label="Loading platform metrics…"/> : <div className="stats-grid admin-stats">
      <Stat title="Users" value={metrics.data.metrics.users}/><Stat title="Customers" value={metrics.data.metrics.customers}/><Stat title="Business owners" value={metrics.data.metrics.owners}/><Stat title="Businesses" value={metrics.data.metrics.businesses}/><Stat title="Pending verification" value={metrics.data.metrics.pendingVerifications}/><Stat title="Verified businesses" value={metrics.data.metrics.verifiedBusinesses}/><Stat title="Online businesses" value={metrics.data.metrics.onlineBusinesses}/><Stat title="Orders today" value={metrics.data.metrics.ordersToday}/><Stat title="Total orders" value={metrics.data.metrics.totalOrders}/><Stat title="Completed revenue" value={money(metrics.data.metrics.completedRevenue)}/><Stat title="Open support" value={metrics.data.metrics.openSupport}/>
    </div>}
    <div className="chip-row admin-tabs">{[['businesses','Businesses'],['orders','Orders'],['users','Users'],['reviews','Reviews'],['activity','Audit log'],['categories','Categories'],['support','Support'],['settings','Settings']].map(([key,label]) => <button className={`chip ${tab === key ? 'active' : ''}`} key={key} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'businesses' && <><label className="admin-search">Search or filter businesses<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Name or status (pending / verified)"/></label>{businesses.loading ? <Loading/> : businesses.error ? <ErrorState message={businesses.error}/> : <div className="admin-list">{filtered.map((business) => <article className="card admin-row" key={business.id}><div><b>{business.name}</b><p>{business.category} · {business.area} · Owner: {business.ownerName}</p><span className={`status status-${business.verificationStatus?.toLowerCase()}`}>{business.verificationStatus}</span>{business.documents?.map((doc) => <button className="text-button" key={doc.id} onClick={async () => { try { const result = await api.get(`/admin/documents/${doc.id}/signed-url`); window.open(result.signedUrl, '_blank', 'noopener,noreferrer'); } catch (error) { toast(error.message, 'error'); } }}>View {doc.document_type}</button>)}</div><div className="action-row">{business.verificationStatus !== 'verified' && <button className="primary-btn" onClick={() => moderation(business,'verified')}>Approve</button>}{business.verificationStatus !== 'rejected' && <button className="ghost-btn" onClick={() => moderation(business,'rejected')}>Reject</button>}{business.verificationStatus !== 'suspended' && <button className="ghost-btn" onClick={() => moderation(business,'suspended')}>Suspend</button>}</div></article>)}</div>}</>}
    {tab === 'orders' && (orders.loading ? <Loading/> : orders.error ? <ErrorState message={orders.error}/> : <div className="order-list">{orders.data.orders.map((order) => <OrderCard key={order.id} order={order}/>)}</div>)}
    {tab === 'users' && <AdminUsers/>}
    {tab === 'reviews' && <AdminReviews/>}
    {tab === 'activity' && <AdminActivity/>}
    {tab === 'categories' && <AdminCategories/>}
    {tab === 'support' && <AdminSupport/>}
    {tab === 'settings' && <AdminSettings/>}
  </Shell>;
}

function AdminUsers() {
  const [refresh, setRefresh] = useState(0);
  const users = useLoad('/admin/users', refresh);
  const toast = useToast();
  const toggle = async (user) => { try { await api.patch(`/admin/users/${user.id}/active`, { isActive: !user.is_active }); setRefresh((value) => value + 1); toast('Account status updated'); } catch (error) { toast(error.message,'error'); } };
  if (users.loading) return <Loading/>;
  if (users.error) return <ErrorState message={users.error}/>;
  return <div className="admin-list">{users.data.users.map((user) => <article className="card admin-row" key={user.id}><div><b>{user.full_name}</b><p>{user.phone} · {roleNames[user.role]}</p><span className={`status ${user.is_active ? 'status-verified' : 'status-suspended'}`}>{user.is_active ? 'Active' : 'Inactive'}</span></div>{user.role !== 'super_admin' && <button className="ghost-btn" onClick={() => toggle(user)}>{user.is_active ? 'Deactivate' : 'Activate'}</button>}</article>)}</div>;
}
function AdminActivity() {
  const result = useLoad('/admin/activity');
  if (result.loading) return <Loading/>;
  if (result.error) return <ErrorState message={result.error}/>;
  return result.data.activity.length ? <div className="notification-list">{result.data.activity.map((event) => <article className="card notification-card" key={event.id}><b>{event.action}</b><p>{event.entity_type} · {event.entity_id}</p><small>{new Date(event.created_at).toLocaleString()}</small></article>)}</div> : <EmptyState title="A fresh start" text="Marketplace moderation and platform activity will appear here."/>;
}
function AdminReviews() {
  const [refresh, setRefresh] = useState(0);
  const result = useLoad('/admin/reviews', refresh);
  const toast = useToast();
  const setVisible = async (review, isVisible) => {
    try { await api.patch(`/admin/reviews/${review.id}`, { isVisible }); setRefresh((value) => value + 1); toast(isVisible ? 'Review restored' : 'Review hidden'); }
    catch (error) { toast(error.message, 'error'); }
  };
  if (result.loading) return <Loading/>;
  if (result.error) return <ErrorState message={result.error}/>;
  return result.data.reviews.length ? <div className="admin-list">{result.data.reviews.map((review) => <article className="card admin-row" key={review.id}><div><b>{review.businesses?.name} · {review.rating}/5</b><p>{review.comment || 'No comment provided.'}</p><small>{review.profiles?.full_name || 'Customer'} · {review.is_visible ? 'Visible' : 'Hidden'}</small></div><button className="ghost-btn" onClick={() => setVisible(review, !review.is_visible)}>{review.is_visible ? 'Hide review' : 'Restore review'}</button></article>)}</div> : <EmptyState title="No reviews to review" text="Verified customer feedback will appear here when it’s ready for moderation."/>;
}
function AdminCategories() {
  const [refresh, setRefresh] = useState(0);
  const result = useLoad('/admin/categories', refresh);
  const [name, setName] = useState('');
  const toast = useToast();
  const add = async (event) => { event.preventDefault(); try { await api.post('/admin/categories', { name }); setName(''); setRefresh((value) => value + 1); toast('Category created'); } catch (error) { toast(error.message,'error'); } };
  const toggle = async (category) => { try { await api.patch(`/admin/categories/${category.id}`, { isActive: !category.is_active }); setRefresh((value) => value + 1); toast('Category updated'); } catch (error) { toast(error.message,'error'); } };
  return <>{result.loading ? <Loading/> : result.error ? <ErrorState message={result.error}/> : <div className="admin-list">{result.data.categories.map((category) => <article className="card admin-row" key={category.id}><b>{category.name}</b><button className="ghost-btn" onClick={() => toggle(category)}>{category.is_active ? 'Deactivate' : 'Activate'}</button></article>)}</div>}<form className="card inline-form" onSubmit={add}><label>New category<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)}/></label><button className="primary-btn">Add category</button></form></>;
}
function AdminSupport() {
  const [refresh, setRefresh] = useState(0);
  const result = useLoad('/admin/support', refresh);
  const toast = useToast();
  const setStatus = async (request, status) => { try { await api.patch(`/admin/support/${request.id}`, { status }); setRefresh((value) => value + 1); toast('Support request updated'); } catch (error) { toast(error.message,'error'); } };
  if (result.loading) return <Loading/>;
  if (result.error) return <ErrorState message={result.error}/>;
  return result.data.requests.length ? <div className="admin-list">{result.data.requests.map((request) => <article className="card admin-row support-row" key={request.id}><div><b>{request.subject}</b><p>{request.message}</p><small>{request.name} · {request.phone} · {request.status}</small></div><select value={request.status} onChange={(event) => setStatus(request, event.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></article>)}</div> : <EmptyState title="Nothing in the support queue" text="Customer messages will appear here when they need a hand."/>;
}

function AdminSettings() {
  const result = useLoad('/admin/settings');
  if (result.loading) return <Loading/>;
  if (result.error) return <ErrorState message={result.error}/>;
  const settings = result.data.settings;
  return <section className="admin-list">
    <p className="muted">Fee changes apply to new orders only. Existing orders keep their original price snapshots.</p>
    <AdminFeeSetting settingKey="platform_fee" label="Platform fee (₹)" value={settings.platform_fee}/>
    <AdminFeeSetting settingKey="delivery_fee" label="Delivery fee (₹)" value={settings.delivery_fee}/>
    <article className="card admin-row"><div><b>Service city</b><p>{settings.service_city || 'Ambernath'}</p></div></article>
  </section>;
}

function AdminFeeSetting({ settingKey, label, value }) {
  const [amount, setAmount] = useState(String(Number(value || 0)));
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api.patch(`/admin/settings/${settingKey}`, { value: Number(amount) });
      setAmount(String(Number(result.setting.value)));
      toast(`${label} updated`);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return <form className="card inline-form" onSubmit={save}>
    <label>{label}<input type="number" min="0" max="100000" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)}/></label>
    <button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save fee'}</button>
  </form>;
}

function BusinessUploads({ business }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const upload = async (kind, file) => {
    if (!file) return;
    const expectedImage = kind !== 'verification';
    if (file.size > (expectedImage ? 5 : 10) * 1024 * 1024 ||
      (expectedImage ? !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) : file.type !== 'application/pdf')) {
      toast(expectedImage ? 'Choose a JPG, PNG, or WebP image under 5 MB.' : 'Choose a PDF document under 10 MB.', 'error');
      return;
    }
    if (!supabase) { toast('Supabase storage is not configured yet.', 'error'); return; }
    setBusy(kind);
    try {
      const details = await api.post(`/owner/businesses/${business.id}/upload`, {
        fileName: file.name, contentType: file.type, size: file.size, documentType: kind,
      });
      const { error } = await supabase.storage.from(details.bucket).uploadToSignedUrl(details.path, details.token, file, { contentType: file.type });
      if (error) throw error;
      toast(kind === 'verification' ? 'Verification document uploaded' : 'Business image uploaded');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(''); }
  };
  return <div className="card upload-card"><h3>Build trust with your business profile</h3>
    <p><strong>Verification:</strong> Upload a clear photo or scan of your Aadhaar card saved as a PDF (up to 10 MB). For privacy, use a masked Aadhaar copy where possible. The PDF is private and accessible only to you and platform administrators.</p>
    <p><strong>Shop photos:</strong> Upload one clear photo from outside and one from inside (JPG, PNG, or WebP, up to 5 MB each). Business profile photos are publicly visible.</p>
    <div className="upload-actions">
      <label className="upload-control">Upload logo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => upload('logo', event.target.files?.[0])}/></label>
      <label className="upload-control">Upload outside shop photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => upload('cover', event.target.files?.[0])}/></label>
      <label className="upload-control">Upload inside shop photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => upload('shop_inside', event.target.files?.[0])}/></label>
      <label className="upload-control">Upload Aadhaar PDF<input type="file" accept="application/pdf" disabled={Boolean(busy)} onChange={(event) => upload('verification', event.target.files?.[0])}/></label>
    </div>{busy && <p role="status">Uploading {busy}…</p>}
  </div>;
}

function Support() {
  const { user } = useAuth();
  const contacts = useLoad('/public-config');
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '', email: user?.email || '', subject: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const toast = useToast();
  const submit = async (event) => {
    event.preventDefault(); setBusy(true);
    try { await api.post('/support', form); setComplete(true); toast('Support request sent'); } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };
  return <Shell><PageHead title="We’re here to help" text="Send a note to our team. We’ll follow up using the contact details you share."/>
    {contacts.data && (contacts.data.supportEmail || contacts.data.supportPhone || contacts.data.supportWhatsApp) && <div className="card support-contacts"><b>Prefer another way?</b>{contacts.data.supportEmail && <a href={`mailto:${contacts.data.supportEmail}`}>{contacts.data.supportEmail}</a>}{contacts.data.supportPhone && <a href={`tel:${contacts.data.supportPhone}`}>{contacts.data.supportPhone}</a>}{contacts.data.supportWhatsApp && <a href={`https://wa.me/${contacts.data.supportWhatsApp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">Message us on WhatsApp</a>}</div>}
    {complete ? <EmptyState title="Your message is with us" text="Our team has received your request." action={<Link className="primary-btn" to="/">Return home</Link>}/> :
      <form className="card auth-form" onSubmit={submit}><label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label><label>Phone<input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label><label>Email (optional)<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label><label>Subject<input required minLength={3} value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })}/></label><label>Message<textarea required minLength={10} maxLength={5000} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })}/></label><button className="primary-btn" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button></form>}
  </Shell>;
}

function LegalPage({ title, content }) {
  return <Shell><PageHead title={title} text="These draft policies must be reviewed and finalized by the business owner and qualified counsel before launch."/><article className="card legal-copy">{content.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</article></Shell>;
}
const legalContent = {
  terms: ['Ask Ambernath helps customers discover independent local businesses in Ambernath. Each listed business is responsible for its services, prices, availability, and fulfilment.', 'Ask Ambernath may charge a platform fee and, where applicable, a delivery fee on an order. The applicable fee amounts and the full order total are shown at checkout before the customer places the request. Fees are recorded in the order and apply to that order; changes to fee settings apply to future orders. If no fee is shown at checkout, no platform or delivery fee is charged for that order.', 'Orders and bookings are requests until accepted by the business. Any payment is made directly to the business using the method shown at checkout. Ask Ambernath does not claim that an offline payment has been received.', 'Users must provide accurate information and use the service lawfully. The platform may restrict accounts or listings to protect customers and local providers.', 'This generic starter text is not legal advice. The actual operating entity, governing law, dispute process, and final terms must be reviewed by qualified counsel before public launch.'],
  privacy: ['The platform uses account, contact, address, order, review, and support information to provide marketplace features and respond to requests.', 'Authentication and production data are hosted by Supabase. Access is restricted by role and row-level security. Do not submit sensitive information that is not needed to fulfil a service.', 'Users may contact support to request help with their information. Retention periods, controller identity, legal basis, and the final rights process must be completed by the actual operating entity before launch.', 'This generic starter text is not a substitute for a privacy-law review. Add the real legal entity and final contact details before public launch.'],
  cancellation: ['Customers may cancel an order while it is pending. After a business accepts or begins work, contact the business to discuss changes or cancellation.', 'Service quality, refunds, and any amount due are handled directly between the customer and the independent provider unless a separate written platform policy states otherwise.', 'This generic starter policy must be reviewed and adapted to the real business model and applicable consumer-protection law before launch.'],
};
function NotFound() {
  return <Shell pageClass="not-found-page">
    <section className="not-found-card" aria-labelledby="not-found-title">
      <span className="not-found-code" aria-hidden="true">404</span>
      <p className="not-found-eyebrow">A LITTLE OFF THE MAP</p>
      <h1 id="not-found-title">This isn’t the place you were looking for.</h1>
      <p className="not-found-copy">The link may have changed or the page may have moved. There’s plenty more to discover around Ambernath.</p>
      <div className="not-found-actions">
        <Link className="primary-btn" to="/"><Home size={17}/> Return home</Link>
        <Link className="ghost-btn" to="/explore"><Search size={17}/> Discover businesses</Link>
      </div>
    </section>
  </Shell>;
}

function MetadataAndAnalytics() {
  const location = useLocation();
  useEffect(() => {
    const publicRoutes = {
      '/': 'Local services in Ambernath',
      '/explore': 'Explore Ambernath businesses',
      '/ask': 'Ask Ambernath',
      '/auth': 'Sign in or create an account',
      '/account': 'Your account',
      '/support': 'Contact support',
      '/terms': 'Terms of service',
      '/privacy': 'Privacy policy',
      '/cancellation': 'Cancellation policy',
    };
    const pageName = publicRoutes[location.pathname] || (location.pathname.startsWith('/business/') ? 'Local business' : 'Ask Ambernath');
    document.title = `${pageName} | Ask Ambernath`;
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = `${window.location.origin}${location.pathname}`;
    const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
    if (import.meta.env.PROD && measurementId && !document.querySelector('[data-aa-analytics]')) {
      const script = document.createElement('script');
      script.async = true;
      script.dataset.aaAnalytics = 'true';
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.append(script);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', measurementId, { send_page_view: false });
    }
    if (import.meta.env.PROD && measurementId && window.gtag) {
      window.gtag('event', 'page_view', { page_path: location.pathname });
    }
  }, [location.pathname]);
  return null;
}

export default function App() {
  return <ToastProvider><MetadataAndAnalytics/><Routes>
    <Route path="/" element={<HomePage/>}/><Route path="/explore" element={<Explore/>}/><Route path="/ask" element={<Ask/>}/>
    <Route path="/business/:slug" element={<BusinessDetail/>}/><Route path="/checkout" element={<Require roles={['customer']}><Checkout/></Require>}/>
    <Route path="/orders" element={<Require><Orders/></Require>}/><Route path="/orders/:id" element={<Require><OrderDetail/></Require>}/>
    <Route path="/account" element={<Account/>}/><Route path="/account/profile" element={<Require><ProfileSettings/></Require>}/><Route path="/account/security" element={<Require><PasswordSettings/></Require>}/><Route path="/account/password" element={<Require><PasswordSettings/></Require>}/><Route path="/account/addresses" element={<Require roles={['customer']}><AddressBook/></Require>}/>
    <Route path="/account/favorites" element={<Require roles={['customer']}><Favorites/></Require>}/><Route path="/account/notifications" element={<Require><Notifications/></Require>}/>
    <Route path="/auth" element={<AuthPage/>}/><Route path="/list-business" element={<Require roles={['business_owner']}><ListBusiness/></Require>}/>
    <Route path="/business" element={<Require roles={['business_owner']}><BusinessPortal/></Require>}/><Route path="/admin" element={<Require roles={['admin','super_admin']}><Admin/></Require>}/>
    <Route path="/support" element={<Support/>}/><Route path="/terms" element={<LegalPage title="Terms of service" content={legalContent.terms}/>}/>
    <Route path="/privacy" element={<LegalPage title="Privacy policy" content={legalContent.privacy}/>}/><Route path="/cancellation" element={<LegalPage title="Cancellation policy" content={legalContent.cancellation}/>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes></ToastProvider>;
}
