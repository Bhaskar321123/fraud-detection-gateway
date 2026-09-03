"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingCart, User, X, Star, CreditCard, Check } from 'lucide-react';
import Image from 'next/image';

// --- Types ---
type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  rating: number;
  category: string;
  description: string;
};

type CartItem = Product & { quantity: number };

// --- Data ---
const PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Aura ANC Headphones',
    price: 299,
    image: '/products/headphones.jpg',
    rating: 4.8,
    category: 'Audio',
    description: 'Immersive sound with active noise cancellation.',
  },
  {
    id: '2',
    name: 'Aeterna Smartwatch',
    price: 399,
    image: '/products/watch.jpg',
    rating: 4.9,
    category: 'Wearables',
    description: 'Track your life with precision and style.',
  },
  {
    id: '3',
    name: 'Nebula Mechanical Keyboard',
    price: 159,
    image: '/products/keyboard.jpg',
    rating: 4.7,
    category: 'Accessories',
    description: 'Tactile switches with vibrant RGB backlighting.',
  },
  {
    id: '4',
    name: 'Apex Wireless Mouse',
    price: 99,
    image: '/products/mouse.jpg',
    rating: 4.6,
    category: 'Accessories',
    description: 'Ultra-lightweight ergonomic design for gaming.',
  },
  {
    id: '5',
    name: 'Deep Audio Cylinder',
    price: 129,
    image: '/products/speaker.jpg',
    rating: 4.5,
    category: 'Audio',
    description: 'Portable bluetooth speaker with rich bass.',
  },
  {
    id: '6',
    name: 'Fujifilm X-T5 Mirrorless',
    price: 1499,
    image: '/products/camera.jpg',
    rating: 5.0,
    category: 'Photography',
    description: 'Vintage aesthetics meet modern photography.',
  },
];

const CATEGORIES = ['All', 'Audio', 'Wearables', 'Accessories', 'Photography'];

// --- Components ---
export default function EcommerceStore() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  // Derived state
  const filteredProducts = useMemo(() => {
    return PRODUCTS.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [searchTerm, selectedCategory]);

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartTotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  // Handlers
  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const handleCheckout = () => {
    setCheckoutSuccess(true);
    setTimeout(() => {
      setCart([]);
      setCheckoutSuccess(false);
      setIsCheckoutOpen(false);
    }, 2500);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans selection:bg-indigo-500/30">
      
      {/* --- NAVBAR --- */}
      <nav className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="font-bold text-white tracking-tighter">S</span>
            </div>
            <span className="text-xl font-semibold tracking-tight hidden sm:block">StoreFront</span>
          </div>

          <div className="flex-1 max-w-xl relative hidden md:block">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-neutral-400" />
            </div>
            <input
              type="text"
              placeholder="Search premium tech..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-900 border border-white/5 rounded-full py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
            />
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsLoginOpen(true)}
              className="p-2.5 text-neutral-400 hover:text-white rounded-full hover:bg-white/5 transition-colors"
            >
              <User className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsCheckoutOpen(true)}
              className="relative p-2.5 text-neutral-400 hover:text-white rounded-full hover:bg-white/5 transition-colors flex items-center gap-2"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <motion.span 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1 right-1 w-4 h-4 bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full"
                >
                  {cartCount}
                </motion.span>
              )}
            </button>
          </div>
        </div>
      </nav>

      <main className="pb-24">
        {/* --- HERO BANNER --- */}
        <div className="relative h-[40vh] min-h-[300px] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 to-neutral-950 z-0" />
          <div className="absolute -top-[20vw] -left-[10vw] w-[40vw] h-[40vw] bg-indigo-500/20 blur-[120px] rounded-full mix-blend-screen" />
          <div className="absolute top-[10vw] -right-[10vw] w-[30vw] h-[30vw] bg-purple-500/20 blur-[100px] rounded-full mix-blend-screen" />
          
          <div className="relative z-10 text-center px-4 max-w-3xl">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-500 mb-6"
            >
              Next-Gen Tech, <br />Elevated Experience.
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg text-neutral-400 mb-8 max-w-xl mx-auto"
            >
              Discover our curated collection of premium electronics designed to upgrade your lifestyle and workflow.
            </motion.p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
          
          {/* --- CATEGORY FILTERS --- */}
          <div className="flex items-center gap-3 overflow-x-auto pb-6 scrollbar-hide">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat 
                    ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]' 
                    : 'bg-neutral-900 border border-white/10 text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* --- PRODUCT GRID --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-8">
            {filteredProducts.map((product, idx) => (
              <motion.div 
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="group relative bg-neutral-900/50 backdrop-blur-sm border border-white/5 rounded-2xl overflow-hidden hover:border-indigo-500/30 transition-colors"
              >
                <div className="aspect-[4/3] w-full relative bg-neutral-950 overflow-hidden">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    className="object-cover transform group-hover:scale-105 transition-transform duration-700 ease-out opacity-80 group-hover:opacity-100"
                  />
                  <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                    <span className="text-xs font-medium text-white">{product.rating}</span>
                  </div>
                </div>
                
                <div className="p-6">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs text-indigo-400 font-semibold mb-1 uppercase tracking-wider">{product.category}</p>
                      <h3 className="text-lg font-medium text-white">{product.name}</h3>
                    </div>
                    <p className="text-lg font-semibold text-white">${product.price}</p>
                  </div>
                  <p className="text-sm text-neutral-400 mb-6 line-clamp-2">
                    {product.description}
                  </p>
                  
                  <button 
                    onClick={() => addToCart(product)}
                    className="w-full py-3 rounded-xl bg-white/5 hover:bg-indigo-500 border border-white/10 hover:border-indigo-500 text-white font-medium transition-all group-hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]"
                  >
                    Add to Cart
                  </button>
                </div>
              </motion.div>
            ))}
            
            {filteredProducts.length === 0 && (
              <div className="col-span-full py-20 text-center text-neutral-500">
                No products found matching your criteria.
              </div>
            )}
          </div>
        </div>
      </main>

      {/* --- MODALS --- */}
      <AnimatePresence>
        {isLoginOpen && (
          <Modal onClose={() => setIsLoginOpen(false)} title="Welcome Back">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">Email Address</label>
                <input type="email" className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" placeholder="you@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">Password</label>
                <input type="password" className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" placeholder="••••••••" />
              </div>
              <button 
                onClick={() => setIsLoginOpen(false)}
                className="w-full mt-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium py-3 rounded-xl hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-shadow"
              >
                Sign In
              </button>
              <p className="text-center text-sm text-neutral-500 mt-4">Don't have an account? <span className="text-indigo-400 cursor-pointer">Sign up</span></p>
            </div>
          </Modal>
        )}

        {isCheckoutOpen && (
          <Modal onClose={() => setIsCheckoutOpen(false)} title="Your Cart">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-neutral-500">
                <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Your cart is empty.</p>
              </div>
            ) : checkoutSuccess ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-12 text-center"
              >
                <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2">Payment Successful!</h3>
                <p className="text-neutral-400 text-sm">Thank you for your test order.</p>
              </motion.div>
            ) : (
              <div className="flex flex-col h-full max-h-[60vh]">
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide">
                  {cart.map(item => (
                    <div key={item.id} className="flex gap-4 p-3 bg-neutral-900/50 rounded-xl border border-white/5 items-center">
                      <div className="w-16 h-16 relative rounded-lg overflow-hidden shrink-0">
                        <Image src={item.image} alt={item.name} fill className="object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-white truncate">{item.name}</h4>
                        <p className="text-xs text-neutral-400">Qty: {item.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">${item.price * item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 pt-6 border-t border-white/10 shrink-0">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-neutral-400">Subtotal</span>
                    <span className="text-2xl font-bold text-white">${cartTotal}</span>
                  </div>
                  <button 
                    onClick={handleCheckout}
                    className="w-full bg-white text-black font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-neutral-200 transition-colors"
                  >
                    <CreditCard className="w-5 h-5" />
                    Test Payment
                  </button>
                </div>
              </div>
            )}
          </Modal>
        )}
      </AnimatePresence>

    </div>
  );
}

// --- Generic Modal Wrapper ---
function Modal({ children, onClose, title }: { children: React.ReactNode, onClose: () => void, title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }} 
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md bg-neutral-950 border border-white/10 p-6 md:p-8 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-600" />
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white bg-neutral-900 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
