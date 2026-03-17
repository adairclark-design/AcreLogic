import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import HeroScreen from '../screens/HeroScreen';
import LocationScreen from '../screens/LocationScreen';
import VegetableGridScreen from '../screens/VegetableGridScreen';
import BedWorkspaceScreen from '../screens/BedWorkspaceScreen';
import CropCalendarScreen from '../screens/CropCalendarScreen';
import YieldSummaryScreen from '../screens/YieldSummaryScreen';
import BedMapScreen from '../screens/BedMapScreen';
import HarvestForecastScreen from '../screens/HarvestForecastScreen';
import FieldJournalScreen from '../screens/FieldJournalScreen';
import FarmDesignerScreen from '../screens/FarmDesignerScreen';
import FarmCanvasScreen from '../screens/FarmCanvasScreen';
import FarmSatelliteScreen from '../screens/FarmSatelliteScreen';
import BlockSetupWizard from '../screens/BlockSetupWizard';
import BlockDetailScreen from '../screens/BlockDetailScreen';
import ModeSelectScreen from '../screens/ModeSelectScreen';
import FamilyPlannerScreen from '../screens/FamilyPlannerScreen';
import GardenSpacePlannerScreen from '../screens/GardenSpacePlannerScreen';
import PricingScreen from '../screens/PricingScreen';
import SuccessScreen from '../screens/SuccessScreen';
import SeedOrderScreen from '../screens/SeedOrderScreen';
import VisualBedLayoutScreen from '../screens/VisualBedLayoutScreen';
import DashboardScreen from '../screens/DashboardScreen';

const Stack = createStackNavigator();

// ─── Detect Stripe post-payment return ───────────────────────────────────────
// If the URL contains ?paid=1 (set by handlePaidExport's success_url), skip the
// Hero/onboarding screen entirely and boot directly into FamilyPlanner so the
// saved plan is restored from localStorage and the PDF export fires immediately.
function getInitialRoute() {
    if (Platform.OS !== 'web') return 'Hero';
    try {
        const params = new URLSearchParams(window.location.search);
        // Stripe post-payment redirect: /success?tier=premium or ?tier=basic
        if (params.get('tier')) return 'Success';
        // Legacy paid export redirect
        if (params.get('paid') === '1') return 'FamilyPlanner';
    } catch {}
    return 'Hero';
}

const INITIAL_ROUTE = getInitialRoute();

export default function AppNavigator() {
    return (
        <NavigationContainer>
            <Stack.Navigator
                initialRouteName={INITIAL_ROUTE}
                screenOptions={{
                    headerShown: false,
                    cardStyleInterpolator: ({ current, layouts }) => ({
                        cardStyle: {
                            opacity: current.progress,
                            transform: [
                                {
                                    translateX: current.progress.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [layouts.screen.width * 0.12, 0],
                                    }),
                                },
                            ],
                        },
                    }),
                    gestureEnabled: true,
                    gestureDirection: 'horizontal',
                }}
            >
                <Stack.Screen name="Hero" component={HeroScreen} />
                <Stack.Screen name="ModeSelector" component={ModeSelectScreen} />
                <Stack.Screen name="FamilyPlanner" component={FamilyPlannerScreen} />
                <Stack.Screen name="GardenSpacePlanner" component={GardenSpacePlannerScreen} />
                <Stack.Screen name="Pricing" component={PricingScreen} />
                <Stack.Screen name="Success" component={SuccessScreen} />
                <Stack.Screen name="Location" component={LocationScreen} />
                <Stack.Screen name="VegetableGrid" component={VegetableGridScreen} />
                <Stack.Screen name="BedWorkspace" component={BedWorkspaceScreen} />
                <Stack.Screen name="CropCalendar" component={CropCalendarScreen} />
                <Stack.Screen name="YieldSummary" component={YieldSummaryScreen} />
                <Stack.Screen name="BedMap" component={BedMapScreen} />
                <Stack.Screen name="HarvestForecast" component={HarvestForecastScreen} />
                <Stack.Screen name="FieldJournal" component={FieldJournalScreen} />
                <Stack.Screen name="FarmDesigner" component={FarmDesignerScreen} />
                <Stack.Screen name="FarmCanvas" component={FarmCanvasScreen} />
                <Stack.Screen name="FarmSatellite" component={FarmSatelliteScreen} />
                <Stack.Screen name="BlockSetupWizard" component={BlockSetupWizard} />
                <Stack.Screen name="BlockDetail" component={BlockDetailScreen} />
                <Stack.Screen name="SeedOrder" component={SeedOrderScreen} />
                <Stack.Screen name="VisualBedLayout" component={VisualBedLayoutScreen} />
                <Stack.Screen name="Dashboard" component={DashboardScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
