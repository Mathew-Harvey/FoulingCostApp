// Test script to verify chart data structure
const FoulingPhysics = require('./server/models/foulingPhysics');
const AdaptiveFoulingModel = require('./server/models/adaptiveModel');

// Mock vessel data
const mockVessel = {
    id: 1,
    name: 'Test Vessel',
    length: 100,
    beam: 20,
    draft: 8,
    cb: 0.7,
    gross_tonnage: 5000,
    displacement: 8000,
    eco_speed: 12,
    full_speed: 18,
    cost_eco: 150,
    cost_full: 300,
    vessel_category: 'cargo'
};

console.log('Testing chart data structure...\n');

try {
    // Test adaptive model
    const adaptiveModel = new AdaptiveFoulingModel(mockVessel);
    
    // Set a mock FR level (FR2)
    adaptiveModel.daysSinceClean = 82;
    
    console.log('Model FR Level:', adaptiveModel.estimateFRLevel());
    console.log('Days since clean:', adaptiveModel.daysSinceClean);
    
    // Generate speed curve
    const speedCurve = adaptiveModel.generateSpeedCurve(8, 16, 5);
    
    console.log('\nSpeed Curve Data:');
    console.log(JSON.stringify(speedCurve, null, 2));
    
    // Test chart data structure
    console.log('\nChart Data Structure:');
    const chartData = {
        labels: speedCurve.map(s => `${s.speed} kn`),
        datasets: [
            {
                label: 'Current Fuel Rate',
                data: speedCurve.map(s => s.fuelRate),
                borderColor: '#f093fb',
                backgroundColor: '#f093fb20',
                fill: true,
                tension: 0.4
            },
            {
                label: 'Clean Hull Fuel Rate',
                data: speedCurve.map(s => s.fuelRate - s.extraFuel),
                borderColor: '#667eea',
                backgroundColor: '#667eea20',
                fill: false,
                tension: 0.4,
                borderDash: [5, 5]
            }
        ]
    };
    
    console.log('Labels:', chartData.labels);
    console.log('Current Fuel Rates:', chartData.datasets[0].data);
    console.log('Clean Hull Rates:', chartData.datasets[1].data);
    
    // Check for any NaN or invalid values
    console.log('\nData Validation:');
    chartData.datasets.forEach((dataset, index) => {
        const hasNaN = dataset.data.some(val => isNaN(val));
        const hasInvalid = dataset.data.some(val => val === null || val === undefined);
        console.log(`Dataset ${index} (${dataset.label}):`);
        console.log(`  - Has NaN: ${hasNaN}`);
        console.log(`  - Has Invalid: ${hasInvalid}`);
        console.log(`  - Min: ${Math.min(...dataset.data)}`);
        console.log(`  - Max: ${Math.max(...dataset.data)}`);
    });
    
    console.log('\n✅ Test completed successfully!');
    
} catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
}
