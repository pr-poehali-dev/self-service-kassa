import { useState, useRef, useCallback, useEffect } from "react";
import Icon from "@/components/ui/icon";

const API = {
  products: "https://functions.poehali.dev/40d4be07-bcff-476e-83d4-6d1d59f59f8a",
  transactions: "https://functions.poehali.dev/5dc5cf89-303c-4f5d-8668-789e0827ada9",
};

// ── Types ──────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji: string;
  image?: string;
  barcode: string;
}

interface CartItem extends Product {
  qty: number;
}

interface Transaction {
  id: string;
  date: string;
  items: CartItem[];
  total: number;
  method: string;
}

type Screen = "shop" | "cart" | "payment" | "receipt" | "history" | "settings";

// ── Mock Data ──────────────────────────────────────────────────────────────
const PRODUCTS: Product[] = [];

const CATEGORIES = ["Все", "Снеки", "Напитки", "Сладости", "Еда"];

const SETTINGS_INIT = {
  storeName: "GameStore",
  currency: "₽",
  sound: true,
};

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(d: Date) {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function formatDate(d: Date) {
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function Index() {
  const [screen, setScreen] = useState<Screen>("shop");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [productsLoading, setProductsLoading] = useState(true);
  const [category, setCategory] = useState("Все");
  const [search, setSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanMode, setScanMode] = useState(false);
  const [payMethod, setPayMethod] = useState<"card" | "cash" | "qr">("card");
  const [settings, setSettings] = useState(SETTINGS_INIT);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [lastTx, setLastTx] = useState<Transaction | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Загрузка товаров из БД
  useEffect(() => {
    fetch(API.products)
      .then(r => r.json())
      .then(data => {
        if (data.products?.length) {
          setProducts(data.products.map((p: { id: number; name: string; price: number; category: string; emoji: string; barcode: string; image?: string }) => ({
            ...p,
            id: String(p.id),
            image: p.image || undefined,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setProductsLoading(false));
  }, []);

  // Загрузка истории транзакций
  const loadTransactions = useCallback(() => {
    fetch(API.transactions)
      .then(r => r.json())
      .then(data => {
        if (data.transactions) {
          setTransactions(data.transactions.map((t: { id: string; total: number; tax_amount: number; method: string; date: string; items: { name: string; price: number; emoji: string; qty: number }[] }) => ({
            id: t.id,
            total: t.total,
            method: t.method,
            date: t.date,
            items: t.items.map(i => ({
              id: "db",
              name: i.name,
              price: i.price,
              emoji: i.emoji,
              barcode: "",
              category: "",
              qty: i.qty,
            })),
          })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const exists = prev.find(i => i.id === product.id);
      if (exists) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...product, qty: 1 }];
    });
    setLastAdded(product.id);
    setTimeout(() => setLastAdded(null), 600);
  }, []);

  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i.id !== id));
  const changeQty = (id: string, delta: number) => {
    setCart(prev =>
      prev
        .map(i => i.id === id ? { ...i, qty: i.qty + delta } : i)
        .filter(i => i.qty > 0)
    );
  };

  const handleBarcode = (code: string) => {
    // Сначала ищем локально, затем в БД
    const local = products.find(p => p.barcode === code.trim());
    if (local) {
      addToCart(local);
      setBarcodeInput("");
      setScanMode(false);
      return;
    }
    fetch(`${API.products}?barcode=${encodeURIComponent(code.trim())}`)
      .then(r => r.json())
      .then(data => {
        if (data.product) {
          const p: Product = { ...data.product, id: String(data.product.id), image: data.product.image || undefined };
          addToCart(p);
          setBarcodeInput("");
          setScanMode(false);
        } else {
          setBarcodeInput("❌ Не найдено");
          setTimeout(() => setBarcodeInput(""), 1000);
        }
      })
      .catch(() => {
        setBarcodeInput("❌ Ошибка");
        setTimeout(() => setBarcodeInput(""), 1000);
      });
  };

  const handlePay = () => {
    setPaymentLoading(true);
    const methodLabel = payMethod === "card" ? "Банковская карта" : payMethod === "cash" ? "Наличные" : "QR-оплата";
    fetch(API.transactions, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map(i => ({ id: Number(i.id), name: i.name, price: i.price, emoji: i.emoji, qty: i.qty })),
        total,
        tax_amount: 0,
        payment_method: methodLabel,
      }),
    })
      .then(r => r.json())
      .then(data => {
        setPaymentLoading(false);
        setPaymentDone(true);
        const tx: Transaction = {
          id: data.id || Date.now().toString(),
          date: new Date().toISOString(),
          items: [...cart],
          total,
          method: methodLabel,
        };
        setLastTx(tx);
        loadTransactions();
        setTimeout(() => {
          setPaymentDone(false);
          setCart([]);
          setScreen("receipt");
        }, 1500);
      })
      .catch(() => {
        // Fallback — сохраняем локально
        setPaymentLoading(false);
        setPaymentDone(true);
        const tx: Transaction = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          items: [...cart],
          total,
          method: methodLabel,
        };
        setLastTx(tx);
        setTransactions(prev => [tx, ...prev]);
        setTimeout(() => {
          setPaymentDone(false);
          setCart([]);
          setScreen("receipt");
        }, 1500);
      });
  };

  const filtered = products.filter(p => {
    const matchCat = category === "Все" || p.category === category;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode.includes(search);
    return matchCat && matchSearch;
  });

  return (
    <div className="min-h-screen grid-bg flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-black/60 backdrop-blur-xl border-b border-purple-500/30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center animate-pulse-neon">
              <span className="text-lg">🎮</span>
            </div>
            <div>
              <h1 className="font-oswald text-xl font-bold text-white leading-none tracking-wide">{settings.storeName}</h1>
              <p className="text-[10px] text-purple-300 tracking-widest">КАССА №1</p>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {([
              { id: "shop", icon: "ShoppingBag", label: "Товары" },
              { id: "cart", icon: "ShoppingCart", label: "Корзина" },
              { id: "history", icon: "Clock", label: "История" },
              { id: "settings", icon: "Settings", label: "Настройки" },
            ] as { id: Screen; icon: string; label: string }[]).map(nav => (
              <button
                key={nav.id}
                onClick={() => { setScreen(nav.id); if (nav.id === "history") loadTransactions(); }}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                  screen === nav.id
                    ? "bg-purple-500/20 text-purple-300 neon-purple"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon name={nav.icon} size={18} />
                <span className="hidden sm:block">{nav.label}</span>
                {nav.id === "cart" && cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                    {cart.reduce((s, i) => s + i.qty, 0)}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="text-right hidden md:block">
            <div className="font-oswald text-lg font-semibold text-cyan-400">{formatTime(new Date())}</div>
            <div className="text-xs text-gray-400">{formatDate(new Date())}</div>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">

        {/* SHOP */}
        {screen === "shop" && (
          <div className="animate-fade-in">
            {/* Scanner */}
            <div className="mb-6 bg-black/40 border border-cyan-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setScanMode(!scanMode); setTimeout(() => barcodeRef.current?.focus(), 100); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 flex-shrink-0 ${
                    scanMode
                      ? "bg-cyan-500 text-black neon-cyan"
                      : "bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-500/25"
                  }`}
                >
                  <Icon name="Scan" size={18} />
                  {scanMode ? "Активен" : "Сканер"}
                </button>
                <input
                  ref={barcodeRef}
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleBarcode(barcodeInput); }}
                  placeholder="Штрихкод — нажмите Enter или кнопку ОК..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/60"
                />
                <button
                  onClick={() => handleBarcode(barcodeInput)}
                  className="px-4 py-2.5 bg-purple-500 hover:bg-purple-400 text-white rounded-xl font-semibold text-sm transition-all neon-purple flex-shrink-0"
                >
                  ОК
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2 ml-1">Введите штрихкод с упаковки товара и нажмите Enter</p>
            </div>

            {/* Categories */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1 items-center">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    category === cat
                      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white neon-purple"
                      : "bg-white/5 text-gray-400 border border-white/10 hover:border-purple-500/40 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Поиск..."
                className="ml-auto flex-shrink-0 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/60 w-44"
              />
            </div>

            {/* Products */}
            {productsLoading && (
              <div className="flex items-center justify-center py-16 gap-3 text-purple-300">
                <Icon name="Loader2" size={24} className="animate-spin" />
                <span className="font-semibold">Загружаю товары...</span>
              </div>
            )}
            {!productsLoading && filtered.length === 0 && (
              <div className="text-center py-20">
                <div className="text-7xl mb-4">📦</div>
                <p className="text-gray-400 text-lg">Товары не добавлены</p>
                <p className="text-gray-500 text-sm mt-2">Добавьте товары в настройках или через сканер</p>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {filtered.map(product => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`product-card group relative bg-black/40 border rounded-2xl overflow-hidden text-left transition-all duration-200 ${
                    lastAdded === product.id
                      ? "border-cyan-400 neon-cyan scale-105"
                      : "border-white/10 hover:border-purple-500/50"
                  }`}
                >
                  <div className="h-28 relative overflow-hidden bg-gradient-to-br from-purple-900/50 to-cyan-900/30">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl">{product.emoji}</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm text-[9px] font-semibold text-purple-300 rounded-md border border-purple-500/30">
                      {product.category}
                    </span>
                    {lastAdded === product.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-cyan-500/30 backdrop-blur-sm">
                        <span className="text-3xl animate-bounce-in">✓</span>
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-semibold text-white leading-tight mb-1 line-clamp-2">{product.name}</p>
                    <p className="text-base font-oswald font-bold text-neon-yellow">{product.price} {settings.currency}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CART */}
        {screen === "cart" && (
          <div className="animate-fade-in max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-oswald text-2xl font-bold text-white">🛒 Корзина</h2>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors">
                  <Icon name="Trash2" size={14} /> Очистить всё
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-7xl mb-4">🛒</div>
                <p className="text-gray-400 text-lg mb-4">Корзина пуста</p>
                <button onClick={() => setScreen("shop")} className="px-6 py-3 bg-purple-500 text-white rounded-xl font-semibold hover:bg-purple-400 transition-all neon-purple">
                  К товарам
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-6">
                  {cart.map(item => (
                    <div key={item.id} className="animate-slide-in-right flex items-center gap-4 bg-black/40 border border-white/10 rounded-2xl p-4 hover:border-purple-500/30 transition-all">
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-purple-900/50 to-cyan-900/30 flex-shrink-0 flex items-center justify-center">
                        {item.image
                          ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                          : <span className="text-2xl">{item.emoji}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm truncate">{item.name}</p>
                        <p className="text-neon-yellow font-oswald font-bold">{item.price} {settings.currency}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => changeQty(item.id, -1)} className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-all">
                          <Icon name="Minus" size={14} />
                        </button>
                        <span className="w-8 text-center font-bold text-white font-oswald text-lg">{item.qty}</span>
                        <button onClick={() => changeQty(item.id, 1)} className="w-8 h-8 bg-purple-500/20 hover:bg-purple-500/40 rounded-lg flex items-center justify-center text-purple-300 transition-all">
                          <Icon name="Plus" size={14} />
                        </button>
                      </div>
                      <div className="text-right min-w-[72px]">
                        <p className="font-oswald font-bold text-neon-cyan text-lg">{item.price * item.qty} {settings.currency}</p>
                      </div>
                      <button onClick={() => removeFromCart(item.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                        <Icon name="X" size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="bg-black/60 border border-purple-500/30 rounded-2xl p-5 neon-purple">
                  <div className="flex justify-between text-sm text-gray-400 mb-3">
                    <span>Товаров</span><span className="text-white">{cart.reduce((s, i) => s + i.qty, 0)} шт.</span>
                  </div>
                  <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                    <span className="font-oswald text-xl font-bold text-white">ИТОГО</span>
                    <span className="font-oswald text-2xl font-bold text-neon-yellow">{total} {settings.currency}</span>
                  </div>
                  <button
                    onClick={() => setScreen("payment")}
                    className="w-full mt-4 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-oswald font-bold text-lg rounded-xl hover:from-purple-400 hover:to-pink-400 transition-all"
                  >
                    К ОПЛАТЕ →
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* PAYMENT */}
        {screen === "payment" && (
          <div className="animate-fade-in max-w-md mx-auto">
            <h2 className="font-oswald text-2xl font-bold text-white mb-6 text-center">💳 Оплата</h2>

            {paymentDone ? (
              <div className="text-center py-16 animate-scale-in">
                <div className="text-8xl mb-4">✅</div>
                <p className="font-oswald text-3xl text-neon-cyan">Оплата прошла!</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {([
                    { id: "card", label: "Карта", icon: "CreditCard" },
                    { id: "cash", label: "Наличные", icon: "Banknote" },
                    { id: "qr", label: "QR-код", icon: "QrCode" },
                  ] as { id: "card" | "cash" | "qr"; label: string; icon: string }[]).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setPayMethod(m.id)}
                      className={`flex flex-col items-center gap-2 py-5 rounded-2xl border-2 font-semibold transition-all duration-200 ${
                        payMethod === m.id
                          ? "border-purple-500 bg-purple-500/20 text-purple-300 neon-purple"
                          : "border-white/10 bg-black/30 text-gray-400 hover:border-white/30 hover:text-white"
                      }`}
                    >
                      <Icon name={m.icon} size={28} />
                      <span className="text-sm">{m.label}</span>
                    </button>
                  ))}
                </div>

                <div className="bg-black/50 border border-white/10 rounded-2xl p-6 mb-6 text-center">
                  <p className="text-gray-400 text-sm mb-1">К оплате</p>
                  <p className="font-oswald text-5xl font-bold text-neon-yellow">{total} <span className="text-2xl">{settings.currency}</span></p>
                </div>

                {payMethod === "qr" && (
                  <div className="flex justify-center mb-6 animate-scale-in">
                    <div className="w-40 h-40 bg-white rounded-2xl flex items-center justify-center text-6xl shadow-2xl">📱</div>
                  </div>
                )}

                <button
                  onClick={handlePay}
                  disabled={paymentLoading}
                  className="w-full py-5 bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-oswald font-bold text-xl rounded-2xl hover:from-cyan-400 hover:to-purple-400 transition-all neon-cyan disabled:opacity-60"
                >
                  {paymentLoading ? (
                    <span className="flex items-center justify-center gap-3">
                      <Icon name="Loader2" size={22} className="animate-spin" />
                      Обработка...
                    </span>
                  ) : "ОПЛАТИТЬ"}
                </button>

                <button onClick={() => setScreen("cart")} className="w-full mt-3 py-3 text-gray-400 hover:text-white text-sm transition-colors">
                  ← Назад в корзину
                </button>
              </>
            )}
          </div>
        )}

        {/* RECEIPT */}
        {screen === "receipt" && (
          <div className="animate-fade-in max-w-sm mx-auto">
            {lastTx ? (
              <div className="bg-black/60 border border-cyan-500/40 rounded-3xl overflow-hidden neon-cyan">
                <div className="bg-gradient-to-r from-cyan-500/20 to-purple-500/20 p-6 text-center border-b border-white/10">
                  <div className="text-5xl mb-2">🧾</div>
                  <h2 className="font-oswald text-xl font-bold text-white">{settings.storeName}</h2>
                  <p className="text-xs text-gray-400 mt-1">Касса №1 • {formatDate(new Date(lastTx.date))} {formatTime(new Date(lastTx.date))}</p>
                </div>

                <div className="p-5 space-y-2.5">
                  {lastTx.items.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-300">{item.emoji} {item.name} × {item.qty}</span>
                      <span className="text-white font-semibold">{item.price * item.qty} {settings.currency}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 p-5 space-y-2">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>Способ оплаты</span><span>{lastTx.method}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-white/10">
                    <span className="font-oswald font-bold text-white text-lg">ИТОГО</span>
                    <span className="font-oswald font-bold text-neon-yellow text-xl">{lastTx.total} {settings.currency}</span>
                  </div>
                </div>

                <div className="px-5 pb-3">
                  <div className="flex gap-0.5 justify-center mb-2">
                    {Array.from({ length: 36 }).map((_, i) => (
                      <div key={i} className="h-8 bg-white/80 rounded-sm" style={{ width: i % 3 === 0 ? "3px" : "2px" }} />
                    ))}
                  </div>
                  <p className="text-center text-[9px] text-gray-500 font-mono">#{lastTx.id.slice(-8)}</p>
                </div>

                <div className="p-5">
                  <p className="text-center text-sm text-neon-cyan mb-4 animate-glow-pulse">Спасибо за покупку! 🎮</p>
                  <button
                    onClick={() => setScreen("shop")}
                    className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-oswald font-bold text-lg rounded-xl hover:from-purple-400 hover:to-pink-400 transition-all neon-purple"
                  >
                    НОВАЯ ПОКУПКА
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-400">Нет чека для отображения</p>
                <button onClick={() => setScreen("shop")} className="mt-4 px-6 py-3 bg-purple-500 text-white rounded-xl font-semibold hover:bg-purple-400 transition-all">
                  К товарам
                </button>
              </div>
            )}
          </div>
        )}

        {/* HISTORY */}
        {screen === "history" && (
          <div className="animate-fade-in max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-oswald text-2xl font-bold text-white">📋 История транзакций</h2>
              {transactions.length > 0 && (
                <div className="px-3 py-1.5 bg-purple-500/20 border border-purple-500/40 rounded-xl text-sm text-purple-300 font-semibold">
                  {transactions.length} чеков
                </div>
              )}
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-7xl mb-4">📭</div>
                <p className="text-gray-400 text-lg">Транзакций пока нет</p>
                <p className="text-gray-500 text-sm mt-2">Совершите покупку, чтобы она появилась здесь</p>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-400 mb-1">Транзакций</p>
                    <p className="font-oswald text-2xl font-bold text-neon-purple">{transactions.length}</p>
                  </div>
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-400 mb-1">Оборот</p>
                    <p className="font-oswald text-2xl font-bold text-neon-yellow">{transactions.reduce((s, t) => s + t.total, 0)} {settings.currency}</p>
                  </div>
                  <div className="bg-black/40 border border-white/10 rounded-2xl p-4 text-center">
                    <p className="text-xs text-gray-400 mb-1">Ср. чек</p>
                    <p className="font-oswald text-2xl font-bold text-neon-cyan">
                      {Math.round(transactions.reduce((s, t) => s + t.total, 0) / transactions.length)} {settings.currency}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {transactions.map((tx, idx) => (
                    <div key={tx.id} className="animate-slide-in-right bg-black/40 border border-white/10 hover:border-purple-500/40 rounded-2xl p-5 transition-all">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-white flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 text-xs flex items-center justify-center font-bold">
                              {idx + 1}
                            </span>
                            Чек #{tx.id.slice(-6)}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 ml-8">
                            {formatDate(new Date(tx.date))} {formatTime(new Date(tx.date))} • {tx.method}
                          </p>
                        </div>
                        <span className="font-oswald font-bold text-neon-yellow text-xl">{tx.total} {settings.currency}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 ml-8">
                        {tx.items.map(item => (
                          <span key={item.id} className="px-2 py-1 bg-white/5 rounded-lg text-xs text-gray-300">
                            {item.emoji} {item.name} ×{item.qty}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {screen === "settings" && (
          <div className="animate-fade-in max-w-xl mx-auto">
            <h2 className="font-oswald text-2xl font-bold text-white mb-6">⚙️ Настройки</h2>

            <div className="space-y-4">
              <div className="bg-black/40 border border-white/10 rounded-2xl p-5">
                <label className="block text-sm font-semibold text-purple-300 mb-2">Название магазина</label>
                <input
                  value={settings.storeName}
                  onChange={e => setSettings(s => ({ ...s, storeName: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/60 font-oswald text-lg"
                />
              </div>

              <div className="bg-black/40 border border-white/10 rounded-2xl p-5">
                <label className="block text-sm font-semibold text-purple-300 mb-3">Валюта</label>
                <div className="flex gap-2">
                  {["₽", "$", "€"].map(cur => (
                    <button
                      key={cur}
                      onClick={() => setSettings(s => ({ ...s, currency: cur }))}
                      className={`flex-1 py-3 rounded-xl font-oswald font-bold text-xl transition-all ${
                        settings.currency === cur
                          ? "bg-purple-500 text-white neon-purple"
                          : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/30 hover:text-white"
                      }`}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-black/40 border border-white/10 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">Звуковые сигналы</p>
                  <p className="text-xs text-gray-400 mt-0.5">Сигнал при сканировании товара</p>
                </div>
                <button
                  onClick={() => setSettings(s => ({ ...s, sound: !s.sound }))}
                  className={`relative w-14 h-7 rounded-full transition-all duration-300 ${settings.sound ? "bg-purple-500 neon-purple" : "bg-white/10"}`}
                >
                  <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-lg transition-all duration-300 ${settings.sound ? "left-7" : "left-0.5"}`} />
                </button>
              </div>

              <div className="bg-black/40 border border-cyan-500/20 rounded-2xl p-5">
                <p className="text-sm text-cyan-400 font-semibold mb-3">Статистика кассы</p>
                <div className="space-y-2 text-sm text-gray-400">
                  <div className="flex justify-between"><span>Версия ПО</span><span className="text-white">1.0.0</span></div>
                  <div className="flex justify-between"><span>Регистр. №</span><span className="text-white">KKT-001</span></div>
                  <div className="flex justify-between"><span>Всего транзакций</span><span className="text-neon-yellow font-semibold">{transactions.length}</span></div>
                  <div className="flex justify-between"><span>Общий оборот</span><span className="text-neon-cyan font-semibold">{transactions.reduce((s, t) => s + t.total, 0)} {settings.currency}</span></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom cart bar */}
      {screen === "shop" && cart.length > 0 && (
        <div className="sticky bottom-0 bg-black/80 backdrop-blur-xl border-t border-purple-500/30 p-4 animate-fade-in">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center border border-purple-500/40">
                <Icon name="ShoppingCart" size={20} className="text-purple-300" />
              </div>
              <div>
                <p className="text-xs text-gray-400">{cart.reduce((s, i) => s + i.qty, 0)} товаров</p>
                <p className="font-oswald font-bold text-neon-yellow text-lg">{total} {settings.currency}</p>
              </div>
            </div>
            <button
              onClick={() => setScreen("cart")}
              className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-oswald font-bold text-lg rounded-xl hover:from-purple-400 hover:to-pink-400 transition-all neon-purple"
            >
              КОРЗИНА →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}