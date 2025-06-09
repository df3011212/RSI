// script.js

let rsiData = JSON.parse(localStorage.getItem('rsi_data') || '[]');
let displayedSymbols = [];
let allSymbols = [];
let currentIndex = 0;
const BATCH_SIZE = 18;
let sortOrder = 'default';
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let hasLoadedOnce = localStorage.getItem('rsi_loaded') === '1';
let modalUpdateTimer = null;

// ✅ 我的最愛卡片區相關
const favoriteSymbols = [];
const favoriteCardMap = {};



let mainSymbols = [
  'BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP',
  'XRP-USDT-SWAP', 'DOGE-USDT-SWAP', 'TON-USDT-SWAP',
  'BCH-USDT-SWAP', 'LTC-USDT-SWAP', 'OKB-USDT-SWAP'
];

let doneCountdown = 5;
let doneTimer = null;
let doneShown = false;

function arraysEqualUnordered(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const val of setA) {
    if (!setB.has(val)) return false;
  }
  return true;
}

async function fetchAllContracts() {
  const res = await fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP');
  const data = await res.json();
  return data.data.filter(d => d.instId.endsWith('-USDT-SWAP')).map(d => d.instId);
}

async function fetchKlines(instId) {
  const res = await fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1H&limit=100`);
  const data = await res.json();
  return data.data.reverse();
}

function calculateRSI(closes, period = 14) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  gains /= period;
  losses /= period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains = (gains * (period - 1) + Math.max(diff, 0)) / period;
    losses = (losses * (period - 1) + Math.max(-diff, 0)) / period;
  }

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

async function updateRSIBatch() {
  if (allSymbols.length === 0) return;

  const batch = allSymbols.slice(currentIndex, currentIndex + BATCH_SIZE);
  const blockNumber = Math.floor(currentIndex / BATCH_SIZE) + 1;

  currentIndex = (currentIndex + BATCH_SIZE) % allSymbols.length;

  for (const instId of batch) {
    try {
      const klines = await fetchKlines(instId);
      const closes = klines.map(k => parseFloat(k[4]));
      const rsi = calculateRSI(closes);

      const existing = rsiData.find(d => d.instId === instId);
      if (existing) {
        existing.rsi = rsi;
      } else {
        rsiData.push({ instId, rsi });
      }

      // ✅ 行閃爍提示
      highlightUpdatedRow(instId);
    } catch (err) {
      console.warn(`Error on ${instId}`, err);
    }
  }

  localStorage.setItem('rsi_data', JSON.stringify(rsiData));
  updateProgress();
  renderTable();

  // ✅ 顯示目前區塊狀態
  const statusEl = document.getElementById('updateStatus');
  if (statusEl) {
    statusEl.textContent = `✅ 第 ${blockNumber} 區塊 / 共 ${window.totalBlocks} 區塊 RSI 已更新`;
    statusEl.style.color = 'green';
    clearTimeout(statusEl._resetTimeout);
    statusEl._resetTimeout = setTimeout(() => {
      statusEl.style.color = '#555';
      statusEl.textContent = '';
    }, 2000);
  }
}


function highlightUpdatedRow(symbol) {
  const row = document.getElementById(`row-${symbol}`);
  if (row) {
    row.style.transition = 'background-color 0.5s';
    row.style.backgroundColor = '#d4f5d4'; // 淺綠
    setTimeout(() => {
      row.style.backgroundColor = '';
    }, 1000);
  }
}

function updateSortIndicator() {
  const rsiHeader = document.getElementById('rsiHeader');
  if (sortOrder === 'asc') {
    rsiHeader.textContent = 'RSI ⬇️';
  } else if (sortOrder === 'desc') {
    rsiHeader.textContent = 'RSI ⬆️';
  } else {
    rsiHeader.textContent = 'RSI ⇅';
  }
}



function updateProgress() {
  const percent = Math.floor((rsiData.length / allSymbols.length) * 100);
  const rsiHeader = document.getElementById('rsiHeader');
  const statusText = document.getElementById('progressStatus');

  const remainingBatches = Math.ceil((allSymbols.length - rsiData.length) / BATCH_SIZE);
  const remainingSeconds = remainingBatches * 1;

  if (percent < 100) {
    rsiHeader.textContent = `載入進度 ${percent}%`;
    statusText.textContent = `📊 排行榜載入進度：剩餘約 ${remainingSeconds} 秒...`;
    statusText.classList.remove('hidden');
    if (doneTimer) {
      clearInterval(doneTimer);
      doneTimer = null;
      updateSortIndicator(); // ✅ 同步 RSI 排序圖示
    }
    doneShown = false;
    } else {
    if (!doneTimer && !doneShown) {
        doneShown = true;
        localStorage.setItem('rsi_loaded', '1');
        doneCountdown = 14;
        statusText.textContent = `✅ 請讓區塊先完成完整的一次更新 (${doneCountdown})`;
        statusText.classList.remove('hidden');
        doneTimer = setInterval(() => {
        doneCountdown--;
        if (doneCountdown > 0) {
            statusText.textContent = `✅ 請讓區塊先完成完整的一次更新 (${doneCountdown})`;
        } else {
            statusText.classList.add('hidden');
            clearInterval(doneTimer);
            doneTimer = null;
        }
        }, 1000);
    }

    // ✅ 用函式顯示正確的 RSI 排序圖示
    updateSortIndicator();
    }

}

function renderTable() {
  const tbody = document.querySelector('#rsiTable tbody');
  tbody.innerHTML = '';

  const ordered = [...mainSymbols, ...allSymbols.filter(i => !mainSymbols.includes(i))];
  displayedSymbols = ordered;

  let sorted;
  if (sortOrder === 'asc') {
    sorted = [...rsiData].sort((a, b) => a.rsi - b.rsi);
  } else if (sortOrder === 'desc') {
    sorted = [...rsiData].sort((a, b) => b.rsi - a.rsi);
  } else {
    sorted = displayedSymbols.map(id => rsiData.find(d => d.instId === id)).filter(Boolean);
  }

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = sorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  pageItems.forEach((item, index) => {
    const instId = item.instId;
    const tr = document.createElement('tr');
    tr.setAttribute('data-symbol', instId);
    tr.setAttribute('id', `row-${instId}`);

    const rankTd = document.createElement('td');
    rankTd.className = 'rank';
    rankTd.textContent = startIndex + index + 1;

const symbolTd = document.createElement('td');
symbolTd.textContent = instId.replace('-USDT-SWAP', 'USDT.P');

const starTd = document.createElement('td');
starTd.innerHTML = `
  <span class="favorite-star" data-symbol="${instId}" style="cursor:pointer;">
    ${favoriteSymbols.includes(instId) ? '★' : '☆'}
  </span>
`;


    const rsiTd = document.createElement('td');
    if (item.rsi != null && !isNaN(item.rsi)) {
      rsiTd.textContent = item.rsi.toFixed(2);
      rsiTd.className = '';
      if (item.rsi >= 70) rsiTd.classList.add('rsi-high');
      else if (item.rsi <= 30) rsiTd.classList.add('rsi-low');
    } else {
      rsiTd.textContent = 'K 棒數量不夠！';
    }

    const blockTd = document.createElement('td');
    const blockNumber = Math.floor(displayedSymbols.indexOf(instId) / BATCH_SIZE) + 1;
    blockTd.textContent = `第 ${blockNumber} 區塊`;

    const updateTd = document.createElement('td');
    const currentBlock = Math.floor(currentIndex / BATCH_SIZE) + 1;
    const totalBlocks = window.totalBlocks || Math.ceil(displayedSymbols.length / BATCH_SIZE);
    const waitBlocks = (blockNumber - currentBlock + totalBlocks) % totalBlocks;
    const waitSeconds = waitBlocks * 1;
    updateTd.textContent = `約 ${waitSeconds} 秒後更新`;

    tr.append(rankTd, symbolTd, starTd, rsiTd, blockTd, updateTd);
    tbody.appendChild(tr);
  });

  renderPagination(totalPages);
}



function renderPagination(totalPages) {
  const pagination = document.getElementById('pagination');
  if (!pagination) return;

  pagination.innerHTML = `
    <button onclick="goToPage(1)" ${currentPage === 1 ? 'disabled' : ''}>⏮️ 第一頁</button>
    <button onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>⬅️ 上一頁</button>
    <span>第 ${currentPage} / ${totalPages} 頁</span>
    <button onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>下一頁 ➡️</button>
    <button onclick="goToPage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>⏭️ 最後頁</button>
  `;
}

function changePage(delta) {
  const ordered = [...mainSymbols, ...allSymbols.filter(i => !mainSymbols.includes(i))];
  const totalPages = Math.ceil(ordered.length / ITEMS_PER_PAGE);
  currentPage = Math.min(Math.max(currentPage + delta, 1), totalPages);
  renderTable();
}

function goToPage(pageNum) {
  const ordered = [...mainSymbols, ...allSymbols.filter(i => !mainSymbols.includes(i))];
  const totalPages = Math.ceil(ordered.length / ITEMS_PER_PAGE);
  currentPage = Math.min(Math.max(pageNum, 1), totalPages);
  renderTable();
}


document.getElementById('rsiHeader').addEventListener('click', () => {
  if (sortOrder === 'desc') {
    sortOrder = 'asc';
  } else if (sortOrder === 'asc') {
    sortOrder = 'default';
  } else {
    sortOrder = 'desc';
  }

  updateSortIndicator(); // ✅ 切換排序圖示
  renderTable();
});

const modal = document.getElementById('detailModal');
const closeModal = document.getElementById('closeModal');
closeModal.addEventListener('click', () => {
  modal.classList.add('hidden');
  clearInterval(modalUpdateTimer); // ✅ 關閉時停止更新
});


async function fetchSymbolDetails(instId) {
  clearInterval(modalUpdateTimer); // ✅ 切換幣種時清掉前一個定時器

  const name = instId.replace('-USDT-SWAP', 'USDT.P');
  document.getElementById('modalTitle').textContent = `📊 ${name} RSI 1H 1秒即時查詢 `;

  async function updateModalContent() {
    try {
      const [kRes, pRes] = await Promise.all([
        fetch(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1H&limit=100`),
        fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`)
      ]);
      const klines = (await kRes.json()).data.reverse();
      const price = parseFloat((await pRes.json()).data[0].last);
      const closes = klines.map(k => parseFloat(k[4]));
      const rsi = calculateRSI(closes).toFixed(2);
      const klineTime = new Date(parseInt(klines.at(-1)[0])).toLocaleString();

      document.getElementById('modalPrice').textContent = `📈 最新價格：${price}`;
      document.getElementById('modalRsi').textContent = `📊 RSI (1H)：${rsi}`;
      document.getElementById('modalRsi').className = '';
      if (rsi >= 70) document.getElementById('modalRsi').classList.add('rsi-high');
      else if (rsi <= 30) document.getElementById('modalRsi').classList.add('rsi-low');
      document.getElementById('modalTime').textContent = `🕒 最後 K 線時間：${klineTime}`;
    } catch (err) {
      console.error('❌ 無法取得資料', err);
    }
  }

  await updateModalContent(); // 第一次顯示資料
  modal.classList.remove('hidden'); // 顯示視窗
  modalUpdateTimer = setInterval(updateModalContent, 1000); // ✅ 每秒更新
}


// 表格點擊事件：點幣種顯示彈窗
document.querySelector('#rsiTable tbody').addEventListener('click', (e) => {
  // 如果點擊的是「星星欄位 <td>」或裡面的東西就跳過
  const isInFavoriteColumn = e.target.closest('td')?.querySelector('.favorite-star');
  if (isInFavoriteColumn) return;

  const tr = e.target.closest('tr');
  if (tr && tr.dataset.symbol) {
    fetchSymbolDetails(tr.dataset.symbol);
  }
});



function addFavorite() {
  const input = document.getElementById('favInput');
  const shortSymbol = input.value.trim().toUpperCase();
  const symbol = allSymbols.find(s => s.startsWith(shortSymbol + '-USDT-SWAP'));

if (!symbol) {
  alert('輸入幣種無效/查無資料');
  return;種
}

  if (favoriteSymbols.includes(symbol)) {
    alert('此幣已在最愛中！');
    return;
  }

  if (favoriteSymbols.length >= 9) {
    alert('最多只能加入 9 張卡片！');
    return;
  }

  favoriteSymbols.push(symbol);
  addFavoriteCard(symbol);
  input.value = '';
}


function addFavoriteCard(symbol) {
  const container = document.getElementById('favoriteCards');
  const card = document.createElement('div');
  card.className = 'rsi-card';
  card.style = `
    border: 1px solid #ccc;
    border-radius: 10px;
    padding: 1rem;
    background: white;
    width: 180px;
    box-shadow: 0 0 8px rgba(0,0,0,0.1);
  `;
  card.innerHTML = `
    <div><strong>${symbol.replace('-USDT-SWAP', 'USDT.P')}</strong></div>
    <div class="price">📈 價格：載入中...</div>
    <div class="rsi">📊 RSI 1H：載入中...</div>
    <div class="update-time">🕒 更新時間：--:--:--</div>
    <button onclick="removeFavorite('${symbol}')">❌ 移除</button>
  `;

  favoriteCardMap[symbol] = card;
  container.appendChild(card);
  localStorage.setItem('favorite_symbols', JSON.stringify(favoriteSymbols));

}


function removeFavorite(symbol) {
  const index = favoriteSymbols.indexOf(symbol);
  if (index !== -1) favoriteSymbols.splice(index, 1);

  if (favoriteCardMap[symbol]) {
    favoriteCardMap[symbol].remove();
    delete favoriteCardMap[symbol];
  }

  // ✅ 移除後都要更新 localStorage（不管有沒有卡片）
  localStorage.setItem('favorite_symbols', JSON.stringify(favoriteSymbols));
}



async function renderFavoriteCards() {
  for (let symbol of favoriteSymbols) {
    try {
      const [kRes, pRes] = await Promise.all([
        fetch(`https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1H&limit=100`),
        fetch(`https://www.okx.com/api/v5/market/ticker?instId=${symbol}`)
      ]);

      const klines = (await kRes.json()).data.reverse();
      const price = parseFloat((await pRes.json()).data[0].last);
      const closes = klines.map(k => parseFloat(k[4]));
      const rsi = calculateRSI(closes).toFixed(2);

      const card = favoriteCardMap[symbol];
      if (card) {
        // ✅ 更新價格
        card.querySelector('.price').textContent = `📈 價格：${price}`;

        // ✅ 更新 RSI 顯示
        const rsiEl = card.querySelector('.rsi');
        rsiEl.textContent = `📊 RSI 1H：${rsi}`;
        rsiEl.className = 'rsi';
        if (rsi >= 70) rsiEl.classList.add('rsi-high');
        else if (rsi <= 30) rsiEl.classList.add('rsi-low');

        // ✅ 更新時間顯示
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];
        const timeEl = card.querySelector('.update-time');
        timeEl.textContent = `🕒 更新時間：${timeStr}`;

        // ✅ 加上閃爍亮色提示
        timeEl.style.transition = 'background-color 0.3s';
        timeEl.style.backgroundColor = '#ffff99'; // 淡黃色
        setTimeout(() => {
          timeEl.style.backgroundColor = '';
        }, 500);
      }

    } catch (e) {
      console.warn(`❌ ${symbol} 更新失敗`, e);
    }
  }
}



// ✅ 每秒更新所有最愛卡片
setInterval(renderFavoriteCards, 1000);


async function start() {
  // ✅ 確保 DOM 載入完再綁定事件
  await new Promise(resolve => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resolve);
    } else {
      resolve();
    }
  });

const savedFavorites = JSON.parse(localStorage.getItem('favorite_symbols') || '[]');
savedFavorites.forEach(symbol => {
  if (!favoriteSymbols.includes(symbol)) {
    favoriteSymbols.push(symbol);
    addFavoriteCard(symbol);
  }
});


  // ✅ 綁定「區塊」標題點擊事件：恢復預設排序
  const blockHeader = document.getElementById('blockHeader');
  if (blockHeader) {
    blockHeader.addEventListener('click', () => {
      sortOrder = 'default';
      updateSortIndicator();
      renderTable();
    });
  }

  // ✅ 開始抓取資料並初始化
  allSymbols = await fetchAllContracts();
  const list = document.getElementById('symbolList');
  if (list) {
    allSymbols.forEach(sym => {
      const coin = sym.replace('-USDT-SWAP', '');  // 取前面幣名
      const option = document.createElement('option');
      option.value = coin;
      list.appendChild(option);
    });
  }


  window.totalBlocks = Math.ceil(allSymbols.length / BATCH_SIZE);

  renderTable();
  setInterval(updateRSIBatch, 1000);

  if (!hasLoadedOnce) {
    await updateRSIBatch();
  }


// ✅ 綁定點擊星星事件（加入/移除最愛）
// ✅ 綁定點擊星星事件（整個星星欄位都可以點）
document.querySelector('#rsiTable').addEventListener('click', (e) => {
  const starEl = e.target.closest('.favorite-star') || e.target.querySelector('.favorite-star');

  // ✅ 如果點到的是星星或星星的父層，就處理加入/移除
  if (starEl) {
    const symbol = starEl.dataset.symbol;

    if (favoriteSymbols.includes(symbol)) {
      removeFavorite(symbol);
      starEl.textContent = '☆';
    } else {
      if (favoriteSymbols.length >= 9) {
        alert('最多只能加入 9 張卡片！');
        return;
      }
      favoriteSymbols.push(symbol);
      addFavoriteCard(symbol);
      starEl.textContent = '★';
    }

    localStorage.setItem('favorite_symbols', JSON.stringify(favoriteSymbols));
  }
});

}








start();