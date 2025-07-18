document.addEventListener('DOMContentLoaded', () => {
    // === DOM-ELEMENTE ===
    const inputs = {
        t: document.getElementById('temperature'),
        rh: document.getElementById('humidity'),
        p: document.getElementById('pressure'),
        v_flow: document.getElementById('volume-flow'),
        processSelect: document.getElementById('process-select'),
        targetValue: document.getElementById('target-value'),
        targetLabel: document.getElementById('target-label'),
    };
    const outputs = {
        current: {
            x: document.getElementById('current-x'), h: document.getElementById('current-h'),
            td: document.getElementById('current-td'), rho: document.getElementById('current-rho'),
        },
        resultCard: document.getElementById('result-card'),
        result: {
            t: document.getElementById('result-t'), rh: document.getElementById('result-rh'),
            x: document.getElementById('result-x'), h: document.getElementById('result-h'),
            powerLabel: document.getElementById('power-label'),
            powerValue: document.getElementById('power-value'),
            waterDiff: document.getElementById('water-diff'),
        }
    };
    const buttons = {
        apply: document.getElementById('apply-process-btn'),
        useAsStart: document.getElementById('use-as-start-btn'),
    };

    let currentState = {};
    let resultState = {};

    // === BERECHNUNGS-KERN ===
    // Berechnet alle Eigenschaften eines Luftzustands basierend auf t, rh und p.
    function calculateState(t, rh, p) {
        // ... (Formeln sind identisch zur vorherigen Version)
        if (isNaN(t) || isNaN(rh) || isNaN(p)) return null;
        const SDD = 6.112 * Math.exp((17.62 * t) / (243.12 + t));
        const DD = (rh / 100) * SDD;
        const v = Math.log(DD / 6.112);
        const Td = (243.12 * v) / (17.62 - v);
        const x_g_kg = 622 * (DD / (p - DD));
        const h = 1.006 * t + (x_g_kg / 1000) * (2501 + 1.86 * t);
        const T_kelvin = t + 273.15;
        const rho = ((p - DD) * 100) / (287.058 * T_kelvin) + (DD * 100) / (461.52 * T_kelvin);
        return { t, rh, p, x_g_kg, h, Td, rho };
    }
    
    // Berechnet einen Zustand rückwärts aus t und x (für Heizen/Kühlen bei konstanter Feuchte).
    function calculateStateFrom_t_x(t, x_g_kg, p) {
        const x_ratio = x_g_kg / 1000;
        const p_d_partial = p / (1 + (1 / 0.622) * x_ratio);
        const DD = p - p_d_partial;
        const SDD = 6.112 * Math.exp((17.62 * t) / (243.12 + t));
        const rh = (DD / SDD) * 100;
        return calculateState(t, rh, p);
    }
    
    // Berechnet einen Zustand rückwärts aus h und x (für Dampfbefeuchtung).
    function calculateStateFrom_h_x(h, x_g_kg, p){
        const t = (h - 2.501 * x_g_kg) / (1.006 + 0.00186 * x_g_kg);
        return calculateStateFrom_t_x(t, x_g_kg, p);
    }


    // === UI-LOGIK ===
    function updateCurrentStateUI() {
        const t = parseFloat(inputs.t.value);
        const rh = parseFloat(inputs.rh.value);
        const p = parseFloat(inputs.p.value);
        
        currentState = calculateState(t, rh, p);

        if (currentState) {
            outputs.current.x.textContent = `${currentState.x_g_kg.toFixed(2)} g/kg`;
            outputs.current.h.textContent = `${currentState.h.toFixed(2)} kJ/kg`;
            outputs.current.td.textContent = `${currentState.Td.toFixed(1)} °C`;
            outputs.current.rho.textContent = `${currentState.rho.toFixed(3)} kg/m³`;
        }
    }

    function handleProcessChange() {
        const process = inputs.processSelect.value;
        switch (process) {
            case 'heat':
            case 'cool':
                inputs.targetLabel.textContent = 'Ziel-Temperatur (°C)';
                break;
            case 'steam_humidify':
                inputs.targetLabel.textContent = 'Ziel-Absolute Feuchte (g/kg)';
                break;
        }
    }

    function applyProcess() {
        const process = inputs.processSelect.value;
        const targetValue = parseFloat(inputs.targetValue.value);
        const v_flow = parseFloat(inputs.v_flow.value);
        if (isNaN(targetValue) || isNaN(v_flow)) return;

        let power = 0;
        let powerLabel = 'Leistung';
        
        switch (process) {
            case 'heat':
                resultState = calculateStateFrom_t_x(targetValue, currentState.x_g_kg, currentState.p);
                power = (v_flow * currentState.rho / 3600) * (resultState.h - currentState.h);
                powerLabel = "Heizleistung";
                break;
            case 'cool':
                const Td_initial = currentState.Td;
                if(targetValue < Td_initial){ // Entfeuchtung findet statt
                    resultState = calculateState(targetValue, 100, currentState.p);
                } else { // Sensible Kühlung
                    resultState = calculateStateFrom_t_x(targetValue, currentState.x_g_kg, currentState.p);
                }
                power = (v_flow * currentState.rho / 3600) * (resultState.h - currentState.h);
                powerLabel = "Kühlleistung";
                break;
            case 'steam_humidify':
                resultState = calculateStateFrom_h_x(currentState.h, targetValue, currentState.p);
                // Annahme: Dampf hat Enthalpie des Ausgangszustands, nur als Befeuchtung. Echter Dampf addiert Energie.
                // Für Einfachheit wird hier nur die Befeuchtung gerechnet, nicht die Dampf-Energie.
                const tempState = calculateStateFrom_t_x(currentState.t, targetValue, currentState.p);
                power = (v_flow * currentState.rho / 3600) * (tempState.h - currentState.h);
                powerLabel = "Heizleistung (durch Befeuchtung)";
                break;
        }
        
        displayResult(power, powerLabel);
    }

    function displayResult(power, powerLabel){
        if (!resultState) return;
        outputs.result.t.textContent = `${resultState.t.toFixed(1)} °C`;
        outputs.result.rh.textContent = `${resultState.rh.toFixed(1)} %`;
        outputs.result.x.textContent = `${resultState.x_g_kg.toFixed(2)} g/kg`;
        outputs.result.h.textContent = `${resultState.h.toFixed(2)} kJ/kg`;
        
        outputs.result.powerLabel.textContent = powerLabel;
        outputs.result.powerValue.textContent = `${Math.abs(power).toFixed(2)} kW`;
        outputs.result.powerValue.className = power > 0 ? 'value heat-value' : 'value cool-value';

        const water_diff = (resultState.x_g_kg - currentState.x_g_kg) * (parseFloat(inputs.v_flow.value) * currentState.rho) / 1000;
        const water_action = water_diff > 0 ? "Befeuchtung" : "Entfeuchtung";
        outputs.result.waterDiff.textContent = `${Math.abs(water_diff).toFixed(2)} kg/h (${water_action})`;
        
        outputs.resultCard.classList.remove('hidden');
    }
    
    function useResultAsStart(){
        if(!resultState) return;
        inputs.t.value = resultState.t.toFixed(1);
        inputs.rh.value = resultState.rh.toFixed(1);
        
        updateCurrentStateUI();
        outputs.resultCard.classList.add('hidden');
    }

    // === EVENT LISTENERS ===
    Object.values(inputs).forEach(input => {
        if(input.id !== 'process-select' && input.id !== 'target-value'){
            input.addEventListener('input', updateCurrentStateUI);
        }
    });
    inputs.processSelect.addEventListener('change', handleProcessChange);
    buttons.apply.addEventListener('click', applyProcess);
    buttons.useAsStart.addEventListener('click', useResultAsStart);

    // === INITIALISIERUNG ===
    updateCurrentStateUI();
});
