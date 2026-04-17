// CONFIGURATION
const API_URL = "http://localhost:5000/api"; // Change to your Render URL after deployment
const TMDB_KEY = 'YOUR_TMDB_KEY';
const OPENAI_KEY = 'YOUR_OPENAI_KEY';

// --- AUTH GUARD ---
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token && !window.location.href.includes('login.html')) {
        window.location.href = 'login.html';
    }
}
checkAuth();

// --- NOTIFICATIONS ---
function showToast(msg) {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// --- THEME TOGGLE ---
const themeBtn = document.getElementById('theme-toggle');
themeBtn?.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light'); 
    showToast(`Theme: ${isDark ? 'Dark' : 'Light'} ✨`);
});

if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
}

// --- AUTH LOGIC ---
async function handleLogin() {
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;

    const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (data.token) {
        localStorage.setItem('token', data.token);
        window.location.href = "index.html";
    } else {
        showToast(data.error || "Login failed");
    }
}

async function handleSignUp() {
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;

    const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (response.status === 201) {
        showToast("Account Created! You can now log in.");
    } else {
        showToast(data.error || "Signup failed");
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    window.location.href = "login.html";
}

// --- MOVIE DISCOVERY ---
async function fetchMovies() {
    const vibe = document.getElementById('vibe-query').value;
    if (!vibe) return showToast("Tell me your vibe first!");
    
    showToast("AI is analyzing your vibe... 🤖");

    try {
        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [{role: "user", content: `Suggest 3 movie keywords for this vibe: ${vibe}. Return ONLY the words separated by commas.`}]
            })
        });
        const aiData = await aiResponse.json();
        const keywords = aiData.choices[0].message.content;

        const tmdbResponse = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(keywords)}`);
        const data = await tmdbResponse.json();
        renderMovies(data.results);
    } catch (err) {
        showToast("Error connecting to APIs");
    }
}

function renderMovies(movies) {
    const grid = document.getElementById('movie-grid');
    if (!grid) return;
    grid.innerHTML = movies.map(m => `
        <div class="movie-card">
            <img src="https://image.tmdb.org/t/p/w500${m.poster_path}" onerror="this.src='https://via.placeholder.com/200x300'">
            <div class="movie-info">
                <h3>${m.title}</h3>
                <button onclick="saveToFavorites('${m.id}', '${m.title.replace(/'/g, "\\'")}', '${m.poster_path}')" class="save-btn">❤️ Save</button>
            </div>
        </div>
    `).join('');
}

// --- FAVORITES (CRUD) ---
async function saveToFavorites(movieId, title, posterPath) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/movies/save`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-auth-token': token
        },
        body: JSON.stringify({ movieId, title, posterPath })
    });
    const result = await response.json();
    showToast(result.message || result.error);
}

async function loadFavorites() {
    const token = localStorage.getItem('token');
    const grid = document.getElementById('favorites-grid');
    if (!grid) return;

    try {
        const response = await fetch(`${API_URL}/movies/favorites`, {
            headers: { 'x-auth-token': token }
        });
        const data = await response.json();
        
        grid.innerHTML = data.map(m => `
            <div class="movie-card">
                <img src="https://image.tmdb.org/t/p/w500${m.posterPath}">
                <h3>${m.title}</h3>
                <button onclick="deleteFavorite('${m._id}')">❌ Remove</button>
            </div>
        `).join('');
    } catch (err) {
        showToast("Failed to load favorites.");
    }
}

async function deleteFavorite(dbId) {
    const token = localStorage.getItem('token');
    await fetch(`${API_URL}/movies/favorite/${dbId}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': token }
    });
    showToast("Removed from favorites");
    loadFavorites(); 
}

// --- AUTO-RUN ---
window.onload = () => {
    if (window.location.pathname.includes('favorites.html')) {
        loadFavorites();
    }
};