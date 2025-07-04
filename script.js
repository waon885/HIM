// script.js (修正版)
document.addEventListener('DOMContentLoaded', () => {

    // --- DOM要素の取得 ---
    const keywordInput = document.getElementById('keyword-input');
    const startYearInput = document.getElementById('start-year-input');
    const endYearInput = document.getElementById('end-year-input');
    const keywordSearchButton = document.getElementById('keyword-search-button');
    const periodSelect = document.getElementById('period-select');
    const locationInput = document.getElementById('location-input');
    const radiusInput = document.getElementById('radius-input');
    const locationSearchButton = document.getElementById('location-search-button');
    const loadingIndicator = document.getElementById('loading-indicator');
    const resultsList = document.getElementById('results-list');
    const timelineContainer = document.getElementById('timeline');

    // --- 地図の初期化 ---
    const map = L.map('map').setView([36, 138], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    const markerCluster = L.markerClusterGroup();
    map.addLayer(markerCluster);

    // --- タイムラインの初期化 ---
    const timelineItems = new vis.DataSet([]);
    const timelineOptions = {
        zoomable: true,
        width: '100%',
        height: '100%',
        stack: true,
        showMajorLabels: true,
        showMinorLabels: true
    };
    const timeline = new vis.Timeline(timelineContainer, timelineItems, timelineOptions);

    // --- 変数定義 ---
    let markerStore = {};
    const periods = {
        'asuka': { start: 592, end: 710 }, 'nara': { start: 710, end: 794 }, 'heian': { start: 794, end: 1185 },
        'kamakura': { start: 1185, end: 1333 }, 'muromachi': { start: 1336, end: 1573 }, 'azuchi-momoyama': { start: 1573, end: 1603 },
        'edo': { start: 1603, end: 1868 }, 'meiji': { start: 1868, end: 1912 },
    };

    // --- イベントリスナー ---
    keywordSearchButton.addEventListener('click', handleKeywordSearch);
    locationSearchButton.addEventListener('click', handleLocationSearch);
    periodSelect.addEventListener('change', (e) => {
        const period = periods[e.target.value];
        startYearInput.value = period ? period.start : '';
        endYearInput.value = period ? period.end : '';
    });
    
    timeline.on('select', (properties) => {
        const selectedId = properties.items[0];
        if (selectedId) {
            const marker = markerStore[selectedId];
            if (marker) {
                markerCluster.zoomToShowLayer(marker, () => {
                    map.setView(marker.getLatLng(), 15);
                    marker.openPopup();
                });
            }
        }
    });

    // --- 検索ハンドラ ---
    async function handleKeywordSearch() {
        const keyword = keywordInput.value.trim();
        if (!keyword) return alert('キーワードを入力してください。');
        const startYear = startYearInput.value ? parseInt(startYearInput.value, 10) : null;
        const endYear = endYearInput.value ? parseInt(endYearInput.value, 10) : null;
        if (startYear && endYear && startYear > endYear) return alert('開始年は終了年より前の年にしてください。');
        
        await executeSearch(async () => {
            const params = {
                generator: 'search',
                gsrsearch: keyword,
                gsrlimit: 50,
            };
            const pageDetails = await fetchWikipediaData(params);
            renderResults(pageDetails, { startYear, endYear });
        });
    }

    async function handleLocationSearch() {
        const location = locationInput.value.trim();
        if (!location) return alert('場所を入力してください。');

        await executeSearch(async () => {
            const coords = await geocodeLocation(location);
            if (!coords) return;
            map.setView([coords.lat, coords.lon], 12);
            const radius = radiusInput.value * 1000;
            const params = {
                generator: 'geosearch',
                ggscoord: `${coords.lat}|${coords.lon}`,
                ggsradius: radius,
                ggslimit: 50,
            };
            const pageDetails = await fetchWikipediaData(params);
            renderResults(pageDetails, {});
        });
    }
    
    // --- 共通処理 ---
    async function executeSearch(searchFunction) {
        showLoading(true);
        try {
            await searchFunction();
        } catch (error) {
            handleError(error);
        } finally {
            showLoading(false);
        }
    }

    function showLoading(isLoading) {
        loadingIndicator.classList.toggle('hidden', !isLoading);
        keywordSearchButton.disabled = isLoading;
        locationSearchButton.disabled = isLoading;
        if (isLoading) {
            markerCluster.clearLayers();
            resultsList.innerHTML = '';
            timelineItems.clear();
            markerStore = {};
            console.clear();
        }
    }

    function handleError(error) {
        console.error('処理中にエラーが発生しました:', error);
        alert('データの取得に失敗しました。開発者コンソールで詳細を確認してください。');
    }

    // --- API連携 (改善版) ---
    async function fetchWikipediaData(params) {
        const url = new URL('https://ja.wikipedia.org/w/api.php');
        const commonParams = {
            action: 'query',
            prop: 'extracts|coordinates',
            exintro: true,
            explaintext: true,
            exsentences: 3,
            coorder: 'primary',
            format: 'json',
            origin: '*'
        };
        url.search = new URLSearchParams({ ...commonParams, ...params }).toString();

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Wikipedia API request failed for params: ${JSON.stringify(params)}`);
        }
        const data = await response.json();
        return data.query ? data.query.pages : {};
    }

    async function geocodeLocation(location) {
        const url = new URL('https://nominatim.openstreetmap.org/search');
        url.search = new URLSearchParams({ q: location, format: 'json', limit: 1, countrycodes: 'jp' }).toString();
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Geocoding API request failed');
            const data = await response.json();
            if (data && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            }
            alert('場所が見つかりませんでした。より具体的な名前で試してください。（例：「東京都」→「千代田区」）');
            return null;
        } catch (error) {
            console.error("Geocoding Error:", error);
            alert("場所情報の取得に失敗しました。APIの利用制限の可能性があります。");
            return null;
        }
    }
    
    // --- 描画処理 (改善版) ---
    function renderResults(pageDetails, filters) {
        const { startYear, endYear } = filters;
        let plottedCount = 0;
        const listFragment = document.createDocumentFragment();
        const newTimelineItems = [];

        if (!pageDetails || Object.keys(pageDetails).length === 0 || pageDetails['-1']) {
            if (resultsList.children.length === 0) {
                const li = document.createElement('li');
                li.textContent = '該当する記事が見つかりませんでした。別のキーワードや条件でお試しください。';
                li.style.padding = '1rem';
                resultsList.appendChild(li);
            }
            console.log(`検索完了: 記事が見つかりませんでした。`);
            return;
        }

        const pages = Object.values(pageDetails);
        const foundWithCoordCount = pages.filter(p => p.coordinates && p.coordinates.length > 0).length;

        for (const page of pages) {
            if (!page.coordinates || page.coordinates.length === 0) continue;
            
            const eventYear = extractYear(page);
            const isInDateRange = isYearInRange(eventYear, startYear, endYear);

            if (isInDateRange) {
                const marker = addMarkerToMap(page, eventYear);
                listFragment.appendChild(createResultListItem(page, eventYear, marker));
                if (eventYear) {
                    newTimelineItems.push({
                        id: page.pageid,
                        content: page.title,
                        start: `${eventYear}-01-01`
                    });
                }
                plottedCount++;
            }
        }
        
        resultsList.appendChild(listFragment);
        timelineItems.add(newTimelineItems);
        if (newTimelineItems.length > 0) {
            timeline.fit();
        }

        if (plottedCount === 0) {
            let message = '';
            if (foundWithCoordCount > 0) {
                message = `位置情報を持つ記事は ${foundWithCoordCount} 件見つかりましたが、指定された期間に一致する出来事はありませんでした。`;
            } else {
                message = '検索条件に一致する記事は見つかりましたが、位置情報を持つものはありませんでした。';
            }
            if (resultsList.children.length === 0) {
                const li = document.createElement('li');
                li.textContent = message;
                li.style.padding = '1rem';
                resultsList.appendChild(li);
            }
        }
        console.log(`検索完了: ${plottedCount}件を表示しました。 (位置情報付きの記事: ${foundWithCoordCount}件)`);
    }

    function addMarkerToMap(page, eventYear) {
        const lat = page.coordinates[0].lat;
        const lon = page.coordinates[0].lon;
        const marker = L.marker([lat, lon]);
        const popupContent = `<h3>${page.title}</h3><p><strong>推定年:</strong> ${eventYear || '不明'}</p><p>${page.extract || ''}</p><a href="https://ja.wikipedia.org/?curid=${page.pageid}" target="_blank" rel="noopener noreferrer">Wikipediaで見る</a>`;
        marker.bindPopup(popupContent);
        markerCluster.addLayer(marker);
        markerStore[page.pageid] = marker;
        return marker;
    }
    
    function createResultListItem(page, eventYear, marker) {
        const listItem = document.createElement('li');
        listItem.className = 'result-item';
        listItem.innerHTML = `<h3>${page.title}</h3><p>${(page.extract || '').substring(0, 80)}... ${eventYear ? `(${eventYear}年頃)`:''}</p>`;
        
        listItem.addEventListener('mouseenter', () => marker._icon?.classList.add('highlight-marker-icon'));
        listItem.addEventListener('mouseleave', () => marker._icon?.classList.remove('highlight-marker-icon'));
        listItem.addEventListener('click', () => {
            timeline.setSelection(page.pageid, { focus: true });
            markerCluster.zoomToShowLayer(marker, () => {
                 map.setView(marker.getLatLng(), 15);
                 marker.openPopup();
            });
        });
        return listItem;
    }

    // --- ヘルパー関数 (改善版) ---
    function extractYear(page) {
        const textToSearch = `${page.title} ${page.extract || ''}`;
        let match;

        // 1. 「西暦xxxx年」
        match = textToSearch.match(/西暦(\d{3,4})年/);
        if (match) return parseInt(match[1], 10);

        // 2. 元号 + 年 (簡易対応)
        const gengou = {
            '明治': 1868, '慶応': 1865, '元治': 1864, '文久': 1861, '万延': 1860,
            '安政': 1854, '嘉永': 1848, '弘化': 1844, '天保': 1830, '文政': 1818,
            '文化': 1804, '享和': 1801, '寛政': 1789, '天明': 1781, '安永': 1772,
            '明和': 1764, '宝暦': 1751, '寛延': 1748, '延享': 1744, '寛保': 1741,
            '元文': 1736, '享保': 1716, '正徳': 1711, '宝永': 1704, '元禄': 1688,
            '貞享': 1684, '天和': 1681, '延宝': 1673, '寛文': 1661, '万治': 1658,
            '慶安': 1648, '正保': 1644, '寛永': 1624, '元和': 1615, '慶長': 1596
        };
        for (const g in gengou) {
            match = textToSearch.match(new RegExp(g + '(\\d{1,2}|元)年'));
            if (match) {
                const yearInGengou = match[1] === '元' ? 1 : parseInt(match[1], 10);
                return gengou[g] + yearInGengou - 1;
            }
        }

        // 3. 「xxxx年に」やタイトルの4桁数字
        match = textToSearch.match(/(\d{4})年に/);
        if (match) return parseInt(match[1], 10);
        match = page.title.match(/\b(\d{4})\b/);
        if (match) return parseInt(match[1], 10);

        // 4. フォールバック「xxxx年」
        match = textToSearch.match(/(\d{3,4})年/);
        if (match) return parseInt(match[1], 10);

        return null;
    }

    function isYearInRange(year, startYear, endYear) {
        if (!startYear && !endYear) return true;
        if (year === null) {
            // 年代フィルターが指定されている場合、年が不明な記事は除外する
            return !(startYear || endYear);
        }
        
        const isAfterStart = startYear ? year >= startYear : true;
        const isBeforeEnd = endYear ? year <= endYear : true;
        return isAfterStart && isBeforeEnd;
    }
});

