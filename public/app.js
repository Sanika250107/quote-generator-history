const $ = (id) => document.getElementById(id);
let currentQuote = null;
let favorites = [];
let savedCurrent = false;
let toastTimer;

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.textContent = "", 2300);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}
function setCurrentQuote(quote) {
  currentQuote = quote;
  savedCurrent = favorites.some(f => f.quote_text === quote.text && f.author === quote.author);
  $("quoteText").textContent = `“${quote.text}”`;
  $("quoteAuthor").textContent = quote.author || "Unknown";
  $("quoteTopic").textContent = quote.topic || "General";
  $("sourcePill").textContent = quote.source === "fallback" ? "LOCAL FALLBACK QUOTE" : "QUOTE OF THE MOMENT";
  $("favoriteBtn").classList.toggle("is-saved", savedCurrent);
  $("favoriteBtn").textContent = savedCurrent ? "♥" : "♡";
  $("favoriteBtn").setAttribute("aria-label", savedCurrent ? "Already saved" : "Save to favorites");
}
async function loadQuote() {
  $("newQuoteBtn").disabled = true;
  $("newQuoteBtn").innerHTML = "<span>↻</span> Finding…";
  try {
    const res = await fetch("/api/quote");
    if (!res.ok) throw new Error("Quote service unavailable");
    const quote = await res.json();
    setCurrentQuote(quote);
    $("apiStatus").textContent = quote.source === "fallback" ? "Using offline fallback quotes" : "Connected to quote service";
  } catch (err) {
    showToast("Could not load a quote. Please try again.");
    $("apiStatus").textContent = "Quote service unavailable";
  } finally {
    $("newQuoteBtn").disabled = false;
    $("newQuoteBtn").innerHTML = "<span>↻</span> New quote";
  }
}
async function loadFavorites() {
  const params = new URLSearchParams();
  const search = $("searchInput").value.trim();
  const topic = $("topicFilter").value;
  if (search) params.set("search", search);
  if (topic) params.set("topic", topic);
  try {
    const res = await fetch(`/api/favorites?${params}`);
    if (!res.ok) throw new Error("Could not load favorites");
    favorites = await res.json();
    renderFavorites();
    if (currentQuote) {
      savedCurrent = favorites.some(f => f.quote_text === currentQuote.text && f.author === currentQuote.author);
      $("favoriteBtn").classList.toggle("is-saved", savedCurrent);
      $("favoriteBtn").textContent = savedCurrent ? "♥" : "♡";
    }
  } catch (_err) {
    $("favoritesList").innerHTML = '<p class="empty-state">Favorites could not be loaded. Refresh to try again.</p>';
  }
}
function renderFavorites() {
  $("savedCount").textContent = favorites.length;
  $("navCount").textContent = favorites.length;
  $("favoritesList").innerHTML = favorites.map(f => `
    <article class="favorite-card">
      <blockquote>“${escapeHtml(f.quote_text)}”</blockquote>
      <div class="favorite-meta">
        <span class="favorite-author">${escapeHtml(f.author)}</span>
        <span class="favorite-topic">${escapeHtml(f.topic || "General")}</span>
      </div>
      <div class="favorite-actions">
        <span class="saved-date">${f.created_at ? `Saved ${escapeHtml(new Date(f.created_at.replace(" ", "T") + "Z").toLocaleDateString())}` : "Saved quote"}</span>
        <div class="small-actions">
          <button class="small-btn" data-copy="${f.id}" title="Copy quote">▢ Copy</button>
          <button class="small-btn remove" data-remove="${f.id}" title="Remove favorite">Remove ×</button>
        </div>
      </div>
    </article>`).join("");
  $("emptyState").classList.toggle("hidden", favorites.length > 0);
}
async function saveFavorite() {
  if (!currentQuote) return;
  if (savedCurrent) { showToast("This quote is already in your favorites."); return; }
  try {
    const res = await fetch("/api/favorites", {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({text:currentQuote.text, author:currentQuote.author, topic:currentQuote.topic, sourceId:currentQuote.id || null})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not save quote");
    savedCurrent = true;
    $("favoriteBtn").classList.add("is-saved");
    $("favoriteBtn").textContent = "♥";
    showToast(data.alreadySaved ? "Already in your collection." : "Saved to your collection.");
    await loadFavorites();
  } catch (err) { showToast(err.message || "Could not save quote."); }
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!");
  } catch (_err) {
    const area = document.createElement("textarea");
    area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
    document.body.appendChild(area); area.select();
    const ok = document.execCommand("copy"); area.remove();
    showToast(ok ? "Copied to clipboard!" : "Copy failed. Please select the quote manually.");
  }
}
async function removeFavorite(id) {
  try {
    const res = await fetch(`/api/favorites/${id}`, {method:"DELETE"});
    if (!res.ok && res.status !== 204) throw new Error("Could not remove favorite");
    showToast("Removed from favorites.");
    await loadFavorites();
  } catch (err) { showToast(err.message); }
}
$("newQuoteBtn").addEventListener("click", loadQuote);
$("favoriteBtn").addEventListener("click", saveFavorite);
$("copyBtn").addEventListener("click", () => currentQuote && copyText(`“${currentQuote.text}” — ${currentQuote.author}`));
$("searchInput").addEventListener("input", () => {
  clearTimeout(window.searchDelay);
  window.searchDelay = setTimeout(loadFavorites, 180);
});
$("topicFilter").addEventListener("change", loadFavorites);
$("favoritesList").addEventListener("click", event => {
  const copy = event.target.closest("[data-copy]");
  const remove = event.target.closest("[data-remove]");
  if (copy) {
    const item = favorites.find(f => String(f.id) === copy.dataset.copy);
    if (item) copyText(`“${item.quote_text}” — ${item.author}`);
  }
  if (remove) removeFavorite(remove.dataset.remove);
});
$("todayLabel").textContent = new Date().toLocaleDateString(undefined, {weekday:"long", month:"long", day:"numeric"}).toUpperCase();
loadQuote();
loadFavorites();
