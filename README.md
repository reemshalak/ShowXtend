# 🪑 ShowXtend – IKEA Spatial XR Furniture Assistant

[![Watch the Demo](https://img.youtube.com/vi/2klu0QMO6v0/maxresdefault.jpg)](https://youtube.com/shorts/2klu0QMO6v0?feature=share)

**Hackathon Submission –  XRCC Hackathon**

An immersive furniture shopping experience combining the IKEA catalog, AI assistance, and real-time 3D placement on PICO headsets.

---

## 🚀 Live Demo

🔗 https://show-xtend.vercel.app

---

## 📌 Project Overview

ShowXtend transforms how users shop for furniture by combining:
- AI-powered assistance  
- Real-time 3D visualization  
- Spatial computing on PICO XR headsets  

Users can browse IKEA’s catalog, get personalized recommendations, and instantly place 3D furniture in their physical space.

---

## ✨ Features

### 🧩 Core Features

- 🛍️ **IKEA Live Catalog** – Real product data via RapidAPI  
- 🤖 **AI Assistant ("Sheri")** – Voice/text shopping + placement help  
- 👥 **Multiplayer Collaboration** – Shop together in real time  
- 🧱 **XR Furniture Placement** – Place 3D models in your room  
- 🛒 **Smart Cart & Wishlist** – Budget tracking + insights  
- ⚖️ **Product Comparison** – Side-by-side comparisons  
- 🎡 **AI Carousel Browser** – 3D product exploration  
- 🧊 **Vision Pro UI** – Frosted glass spatial interface  

---

### ⚡ Advanced Features

- 💰 Budget tracking with real-time analysis  
- 🎤 Voice interaction (Speech-to-Text + TTS)  
- 🌐 Works on Web + PICO (OS 6+)  
- 🔄 Real-time sync via Supabase  
- 🎨 Product variants (color/materials)  
- ⭐ Ratings & reviews integration  

---

## 🧱 Tech Stack

| Category        | Tech |
|----------------|------|
| Frontend       | React 18 + TypeScript |
| Build Tool     | Vite |
| XR SDK         | WebSpatial |
| 3D Models      | Tripo3D AI |
| Database       | Supabase (Realtime + WebRTC) |
| AI             | Gemini 2.0 Flash + OpenRouter |
| Product Data   | IKEA API (RapidAPI) |
| Styling        | CSS Modules + Custom Glass UI |
| Voice          | Web Speech API |
| State          | React Context + BroadcastChannel |

---

## ⚙️ Installation

### Prerequisites
- Node.js 18+
- npm or yarn

### Steps

```bash
# 1. Clone repo
git clone https://github.com/reemshalak/ShowXtend.git
cd ShowXtend

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env

# 4. Run dev server
npm run dev

# 5. Build for production
npm run build
