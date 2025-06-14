document.addEventListener('DOMContentLoaded', () => {
    gsap.registerPlugin(ScrollTrigger);

    const visContainer = d3.select("#vis-container");
    const textContainer = d3.select("#text-container");
    const svg = d3.select("#vis-svg");
    const tooltip = d3.select("#tooltip");
    
    const { width, height } = svg.node().getBoundingClientRect();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const toClassName = (name) => name.replace(/[^a-zA-Z0-9]/g, '');

    const regionNameMapping = {
        "Zhytomyr": "Житомирська область",
        "Zaporizhzhya": "Запорізька область",
        "Volyn": "Волинська область",
        "Vinnytsya": "Вінницька область",
        "Transcarpathia": "Закарпатська область",
        "Ternopil'": "Тернопільська область",
        "Sumy": "Сумська область",
        "Rivne": "Рівненська область",
        "Poltava": "Полтавська область",
        "Odessa": "Одеська область",
        "Mykolayiv": "Миколаївська область",
        "Luhans'k": "Луганська область",
        "L'viv": "Львівська область",
        "Kirovohrad": "Кіровоградська область",
        "Kiev City": "м. Київ",
        "Kiev": "Київська область",
        "Khmel'nyts'kyy": "Хмельницька область",
        "Kherson": "Херсонська область",
        "Kharkiv": "Харківська область",
        "Ivano-Frankivs'k": "Івано-Франківська область",
        "Donets'k": "Донецька область",
        "Dnipropetrovs'k": "Дніпропетровська область",
        "Chernivtsi": "Чернівецька область",
        "Chernihiv": "Чернігівська область",
        "Cherkasy": "Черкаська область"
    };

    const alertColor = '#ff4136';
    const topoJsonUrl = 'https://raw.githubusercontent.com/org-scn-design-studio-community/sdkcommunitymaps/refs/heads/master/geojson/Europe/Ukraine-regions.json';
    const alertDataUrl = 'alert_durations_by_region.csv';
    const weeklyDataUrl = 'weekly_alert_durations.csv';
    const hourlyDataUrl = 'hourly_alert_counts.csv';
    const hourlyAlertsByRegionUrl = 'hourly_alerts_by_region.csv';

    gsap.set([visContainer.node(), textContainer.node()], { autoAlpha: 0 });

    const masterTl = gsap.timeline({
        scrollTrigger: {
            trigger: "#intro-section",
            start: "bottom bottom",
            end: "+=100%",
            scrub: true,
            pin: false,
        }
    });

    masterTl
        .to("#intro-section h1", { scale: 0.7, opacity: 0, ease: 'power2.in' })
        .to([visContainer.node(), textContainer.node()], { autoAlpha: 1, ease: 'power2.out' }, "<0.2");

    ScrollTrigger.create({
        trigger: "body",
        start: 1,
        end: "max",
        onEnter: () => gsap.to(".scroll-down-icon", { opacity: 0, duration: 0.3 }),
        onLeaveBack: () => gsap.to(".scroll-down-icon", { opacity: 1, duration: 0.3 })
    });

    Promise.all([
        d3.json(topoJsonUrl),
        d3.csv(alertDataUrl),
        d3.csv(weeklyDataUrl),
        d3.csv(hourlyDataUrl),
        d3.csv(hourlyAlertsByRegionUrl)
    ]).then(([topoData, alertDurationData, weeklyAlertData, hourlyAlertData, hourlyAlertsByRegionData]) => {
        const geoData = topojson.feature(topoData, topoData.objects.UKR_adm1);
        let currentAnimation;
        let isRadialChartActive = false;
        let isChoroplethMapActive = false;

        const alertDataByRegion = new Map(alertDurationData.map(d => [d.region, {
            duration: +d.duration_hours,
            normalized: +d.duration_normalized
        }]));

        let maxDurationRegion = '';
        let maxDuration = 0;
        for (const [region, data] of alertDataByRegion.entries()) {
            if (data.duration > maxDuration) {
                maxDuration = data.duration;
                maxDurationRegion = region;
            }
        }

        const weeklyData = weeklyAlertData.slice(0, -1).map(d => ({
            week: +d.week,
            duration_hours: +d.duration_hours
        }));

        const hourlyAlerts = hourlyAlertsByRegionData.map(d => ({
            hour: d.hour,
            regions: d.regions ? d.regions.split('|') : []
        }));

        const mapGroup = svg.append("g").attr("class", "map-layer");
        const chartGroup = svg.append("g").attr("class", "chart-layer").style("opacity", 0);

        const initialProjection = d3.geoMercator().fitSize([width, height], geoData);
        const initialPathGenerator = d3.geoPath().projection(initialProjection);
        
        const finalPadding = 120;
        const finalWidth = window.innerWidth;
        const finalHeight = window.innerHeight;
        const finalProjection = d3.geoMercator().fitExtent(
            [[finalPadding, finalPadding], [finalWidth - finalPadding, finalHeight - finalPadding]],
            geoData
        );
        const finalPathGenerator = d3.geoPath().projection(finalProjection);
        const finalViewBox = `0 0 ${finalWidth} ${finalHeight}`;

        const targetRegionName = maxDurationRegion;
        const targetFeature = geoData.features.find(f => f.properties.NAME_1 === targetRegionName);

        const fullZoomProjection = d3.geoMercator().fitSize([width, height], targetFeature);

        const mediumZoomScale = d3.interpolate(initialProjection.scale(), fullZoomProjection.scale())(0.5);
        const mediumZoomTranslate = d3.interpolate(initialProjection.translate(), fullZoomProjection.translate())(0.5);

        const zoomProjection = d3.geoMercator()
            .scale(mediumZoomScale)
            .translate(mediumZoomTranslate);
            
        const zoomPathGenerator = d3.geoPath().projection(zoomProjection);

        mapGroup.selectAll(".region")
            .data(geoData.features)
            .enter().append("path")
            .attr("class", d => `region region-${toClassName(d.properties.NAME_1)}`)
            .attr("d", initialPathGenerator)
            .each(function(d) {
                d3.select(this).attr("data-initial-d", initialPathGenerator(d));
                d3.select(this).attr("data-zoom-d", zoomPathGenerator(d));
                d3.select(this).attr("data-final-d", finalPathGenerator(d));
            })
            .on("mouseover", function(event, d) {
                if (!isChoroplethMapActive) return;
                const regionData = alertDataByRegion.get(d.properties.NAME_1);
                if (!regionData) return;
                tooltip.style("opacity", 1).html(`<b>${regionNameMapping[d.properties.NAME_1]}</b><br>${regionData.duration.toFixed(0)} годин у тривозі`);
            })
            .on("mousemove", (event) => {
                if (!isChoroplethMapActive) return;
                tooltip.style("left", `${event.pageX}px`).style("top", `${event.pageY - 20}px`);
            })
            .on("mouseout", () => {
                tooltip.style("opacity", 0);
            });

        const areaChartGroup = chartGroup.append("g").attr("class", "area-chart-wrapper").style("opacity", 0);
        const margin = { top: 40, right: 30, bottom: 40, left: 50 };
        const chartW = width * 0.8, chartH = height * 0.48;

        const x = d3.scaleLinear()
            .domain(d3.extent(weeklyData, d => d.week))
            .range([0, chartW]);

        const y = d3.scaleLinear()
            .domain([0, d3.max(weeklyData, d => d.duration_hours)])
            .nice()
            .range([chartH, 0]);
        
        const area = d3.area()
            .x(d => x(d.week))
            .y0(chartH)
            .y1(d => y(d.duration_hours))
            .curve(d3.curveMonotoneX);
        
        const line = d3.line()
            .x(d => x(d.week))
            .y(d => y(d.duration_hours))
            .curve(d3.curveMonotoneX);

        const yOffset = (height - chartH) / 2;
        areaChartGroup.attr("transform", `translate(${margin.left}, ${yOffset})`);
        
        areaChartGroup.append("path")
            .datum(weeklyData)
            .attr("class", "line-chart-area")
            .attr("d", area);

        areaChartGroup.append("path")
            .datum(weeklyData)
            .attr("class", "line-chart-line")
            .attr("d", line);
        
        const xMax = d3.max(weeklyData, d => d.week);
        const xTicks = d3.range(1, xMax + 1, 4);
        const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
        areaChartGroup.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(0, ${chartH})`)
            .call(d3.axisBottom(x)
                .tickValues(xTicks)
                .tickFormat(d => monthNames[(d - 1) / 4])
            );
        
        const yDomain = y.domain();
        const yTicks = d3.range(40, yDomain[1] + 1, 40);
        areaChartGroup.append("g")
            .attr("class", "axis")
            .call(d3.axisLeft(y)
                .tickValues(yTicks)
                .tickFormat(d => `${d} год`)
            );

        const radialChartGroup = chartGroup.append("g").attr("class", "radial-chart-wrapper").style("opacity", 0);
        
        const radialData = hourlyAlertData.map(d => ({
            hour: +d.hour,
            val: +d.normalized_count,
            count: +d.alert_count
        }));

        const rMargin = { top: 20, right: 20, bottom: 20, left: 20 };
        const innerRadius = 120, outerRadius = Math.min(width, height) / 2 - rMargin.top;
        const angle = d3.scaleBand().domain(radialData.map(d=>d.hour)).range([0, 2 * Math.PI]).align(0);
        const radius = d3.scaleLinear().domain([0, d3.max(radialData, d=>d.val)]).range([innerRadius, outerRadius]);
        
        const opacityScale = d3.scaleLinear()
            .domain(d3.extent(radialData, d => d.val))
            .range([0.5, 1]);

        radialChartGroup.attr("transform", `translate(${width/2}, ${height/2})`);
        const arc = d3.arc().innerRadius(innerRadius).outerRadius(d => radius(d.val)).startAngle(d => angle(d.hour)).endAngle(d => angle(d.hour) + angle.bandwidth()).padAngle(0.01).padRadius(innerRadius);
        
        radialChartGroup.selectAll("path.radial-bar")
            .data(radialData)
            .enter().append("path")
            .attr("class", "radial-bar")
            .style("opacity", d => opacityScale(d.val))
            .attr("d", arc)
            .on("mouseover", function(event, d) {
                if (!isRadialChartActive) return;
                tooltip.style("opacity", 1)
                    .html(`<b>${d.hour}:00</b><br>Тривоги: ${d.count}`);
            })
            .on("mousemove", (event) => {
                if (!isRadialChartActive) return;
                tooltip.style("left", `${event.pageX}px`).style("top", `${event.pageY - 20}px`);
            })
            .on("mouseout", () => {
                tooltip.style("opacity", 0);
            });

        radialChartGroup.append("g")
            .selectAll("text")
            .data(radialData)
            .join("text")
            .attr("class", "hour-label")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .attr("transform", d => {
                const labelAngle = angle(d.hour) + angle.bandwidth() / 2;
                const labelRadius = innerRadius - 20;
                const x = labelRadius * Math.sin(labelAngle);
                const y = -labelRadius * Math.cos(labelAngle);
                return `translate(${x}, ${y})`;
            })
            .text(d => d3.format("02")(d.hour));

        const stepDefinitions = {
            1: {
                animate: (timeline, direction, isMobile) => {
                    const dezoomDuration = direction === -1 ? 0 : 0.8;
                    timeline
                        .to(svg.node(), { attr: { viewBox: `0 0 ${width} ${height}` }, duration: dezoomDuration }, 0)
                        .to(".region", { attr: { d: function(index, target) { return target.getAttribute("data-initial-d"); } }, opacity: 1, duration: dezoomDuration }, 0)
                        .to(".region", { fill: '#ccc', duration: dezoomDuration }, 0);
                }
            },
            2: {
                animate: (timeline, direction, isMobile) => {
                    const dezoomDuration = direction === -1 ? 0 : 0.8;
                    const colorScale = d3.scaleSequential(d3.interpolate("#fee7e6", alertColor)).domain([0, 1]);
                    timeline
                        .to(svg.node(), { attr: { viewBox: `0 0 ${width} ${height}` }, duration: dezoomDuration }, 0)
                        .to(".region", { attr: { d: function(index, target) { return target.getAttribute("data-initial-d"); } }, opacity: 1, duration: dezoomDuration }, 0)
                        .to(".region", { 
                            fill: function(index, target) {
                                const d = d3.select(target).datum();
                                if (!d || !d.properties) return '#ccc';
                                const regionData = alertDataByRegion.get(d.properties.NAME_1);
                                return regionData ? colorScale(regionData.normalized) : '#ccc';
                            },
                            duration: dezoomDuration
                        }, 0);
                }
            },
            3: {
                animate: (timeline, direction, isMobile) => {
                    const elements = areaChartGroup.selectAll(".line-chart-area, .line-chart-line, .axis");
                    timeline.fromTo(elements, 
                        { opacity: 0, y: 30 }, 
                        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.1 }
                    );
                }
            },
            4: {
                animate: (timeline, direction, isMobile) => {
                    const elements = radialChartGroup.selectAll(".radial-bar");
                    timeline.fromTo(elements,
                        { scaleY: 0, transformOrigin: 'center' },
                        { scaleY: 1, transformOrigin: 'center', duration: 0.5, stagger: 0.015, ease: 'power3.out' }
                    );
                }
            },
            5: {
                animate: (timeline, direction, isMobile) => {
                    if (targetFeature) {
                        timeline
                            .to(svg.node(), { attr: { viewBox: `0 0 ${width} ${height}` } }, 0)
                            .to(".region", { attr: { d: function(index, target) { return target.getAttribute("data-zoom-d"); } }, opacity: 1 }, 0)
                            .to(".region", { fill: '#ccc', opacity: 0.6 }, 0)
                            .to(`.region-${toClassName(targetRegionName)}`, { opacity: 1, fill: alertColor }, 0);
                    }
                }
            },
            6: {
                animate: (timeline, direction, isMobile) => {
                    const timestampDisplay = document.getElementById('timestamp-display');
                    function formatTimestamp(isoString) {
                        const date = new Date(isoString);
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const year = date.getFullYear();
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        return `${day}.${month}.${year} ${hours}:${minutes}`;
                    }

                    const targetViewBox = isMobile ? `0 0 ${width} ${height}` : finalViewBox;
                    const targetDAttr = isMobile ? "data-initial-d" : "data-final-d";

                    timeline
                        .to(svg.node(), { attr: { viewBox: targetViewBox } }, 0)
                        .to(".region", { attr: { d: function(index, target) { return target.getAttribute(targetDAttr); } }, opacity: 1, fill: '#ccc' }, 0);

                    let lastRegions = new Set();
                    const stepDuration = 0.5;
                    const totalDuration = hourlyAlerts.length * stepDuration;

                    hourlyAlerts.forEach((hourData, index) => {
                        const currentRegions = new Set(hourData.regions);
                        const time = index * stepDuration;

                        timeline.call(() => {
                            timestampDisplay.textContent = formatTimestamp(hourData.hour);
                        }, [], time);

                        const regionsToTurnOn = new Set([...currentRegions].filter(r => !lastRegions.has(r)));
                        const regionsToTurnOff = new Set([...lastRegions].filter(r => !currentRegions.has(r)));

                        const onSelectors = [...regionsToTurnOn].map(r => `.region-${toClassName(r)}`).join(',');
                        const offSelectors = [...regionsToTurnOff].map(r => `.region-${toClassName(r)}`).join(',');

                        if (onSelectors) {
                            timeline.to(onSelectors, { fill: alertColor, duration: 0 }, time);
                        }
                        if (offSelectors) {
                            timeline.to(offSelectors, { fill: '#ccc', duration: 0 }, time);
                        }

                        lastRegions = currentRegions;
                    });

                    const lastRegionsSelectors = [...lastRegions].map(r => `.region-${toClassName(r)}`).join(',');
                    if (lastRegionsSelectors) {
                        timeline.to(lastRegionsSelectors, { fill: '#ccc', duration: 0 }, totalDuration);
                    }
                    
                    timeline.repeat(-1);
                }
            }
        };

        const allSteps = gsap.utils.toArray('.step, .step-trigger');
        let lastStep = 0;
        
        function handleStep(stepNumber, stepEl, direction) {
            if (lastStep !== stepNumber) {
                updateVisualization(stepNumber, direction);
                lastStep = stepNumber;
            }
            if(stepEl.classList.contains('step')){
                document.querySelectorAll('.step.is-active').forEach(el => el.classList.remove('is-active'));
                stepEl.classList.add('is-active');
            }
        }
        
        allSteps.forEach((stepEl) => {
            const stepNumber = parseInt(stepEl.dataset.step, 10);
            ScrollTrigger.create({
                trigger: stepEl,
                start: 'top 80%',
                end: 'bottom 20%',
                onEnter: (self) => handleStep(stepNumber, stepEl, self.direction),
                onLeave: (self) => { if(stepEl.classList.contains('step') && self.direction === 1) stepEl.classList.remove('is-active'); },
                onEnterBack: (self) => handleStep(stepNumber, stepEl, self.direction),
                onLeaveBack: (self) => { if(stepEl.classList.contains('step') && self.direction === -1) stepEl.classList.remove('is-active'); }
            });
        });

        function updateVisualization(step, direction = 1) {
            if (currentAnimation) {
                currentAnimation.kill();
            }
            currentAnimation = gsap.timeline({ defaults: { duration: 0.8, ease: 'power3.inOut' } });

            const isMobile = window.innerWidth <= 900;
            const stepConfig = stepDefinitions[step] || {};
            const isChartStep = step === 3 || step === 4;
            const isFinalStep = step === 6;
            
            isRadialChartActive = (step === 4);
            isChoroplethMapActive = (step === 2);

            currentAnimation
                .to("#text-container", { autoAlpha: isFinalStep ? 0 : 1 }, 0)
                .to("#vis-container", { 
                    width: isFinalStep ? '100%' : (isMobile ? '100%' : '55%'), 
                    padding: isMobile ? '1rem' : (isFinalStep ? '0' : '10vh')
                }, 0)
                .to(mapGroup.node(), { autoAlpha: isChartStep ? 0 : 1 }, 0)
                .to(chartGroup.node(), { autoAlpha: isChartStep ? 1 : 0 }, 0)
                .to(areaChartGroup.node(), { autoAlpha: step === 3 ? 1 : 0 }, 0)
                .to(radialChartGroup.node(), { autoAlpha: step === 4 ? 1 : 0 }, 0)
                .to("#timestamp-container", { autoAlpha: isFinalStep ? 1 : 0, duration: 0 }, 0);

            tooltip.style("opacity", 0);

            if (stepConfig.animate) {
                stepConfig.animate(currentAnimation, direction, isMobile);
            }
        }
    }).catch(error => {
        console.error("Помилка завантаження даних:", error);
        visContainer.node().innerHTML = `<p style="color:red; text-align:center;">Не вдалося завантажити дані карти або тривог.</p>`;
    });
});