// Initialize Supabase
const _supabase = supabase.createClient('YOUR_SUPABASE_URL', 'YOUR_SUPABASE_KEY');
const TMDB_KEY = 'YOUR_TMDB_KEY';

// --- Tier C: Dark Mode ---
const themeBtn = document.getElementById('theme-toggle');
themeBtn?.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    showToast("Theme toggled! ✨");
});

// --- Tier C: Notifications ---
function showToast(msg) {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// --- Basic Requirement: Auth ---
async function handleSignUp() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await _supabase.auth.signUp({ email, password });
    if (error) showToast(error.message);
    else showToast("Check your email for confirmation!");
}

async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) showToast(error.message);
    else window.location.href = "index.html";
}

async function handleLogout() {
    await _supabase.auth.signOut();
    window.location.href = "login.html";
}

// --- Basic Requirement: API Integration ---
async function fetchMovies() {
    const query = document.getElementById('vibe-query').value;
    const response = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${query}`);
    const data = await response.json();
    renderMovies(data.results);
}

function renderMovies(movies) {
    const grid = document.getElementById('movie-grid');
    grid.innerHTML = movies.map(m => `
        <div class="movie-card">
            <img src="https://image.tmdb.org/t/p/w500${m.poster_path}" onerror="this.src='https://via.placeholder.com/200x300'">
            <h3>${m.title}</h3>
            <button onclick="saveToFavorites('${m.id}', '${m.title}')" class="save-btn">❤️ Save</button>
        </div>
    `).join('');
}

// --- Tier B: Saved/Favorites ---
async function saveToFavorites(id, title) {
    const { data: { user } } = await _supabase.auth.getUser();
    if (!user) return showToast("Please login first!");

    const { error } = await _supabase.from('favorites').insert([{ user_id: user.id, movie_id: id, title: title }]);
    if (error) showToast("Already in favorites!");
    else showToast(`Saved ${title}! 🍿`);
}