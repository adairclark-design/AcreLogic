import React, { useState, useEffect } from 'react';
import { Platform, ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { loadNavigationState, saveNavigationState } from '../services/navigationSync';

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
import RoleSelectScreen from '../screens/RoleSelectScreen';
import FarmPlanListScreen from '../screens/FarmPlanListScreen';
import FamilyPlannerScreen from '../screens/FamilyPlannerScreen';
import GardenSpacePlannerScreen from '../screens/GardenSpacePlannerScreen';
import PricingScreen from '../screens/PricingScreen';
import SuccessScreen from '../screens/SuccessScreen';
import SeedOrderScreen from '../screens/SeedOrderScreen';
import VisualBedLayoutScreen from '../screens/VisualBedLayoutScreen';
import BedDesignerSetupScreen from '../screens/BedDesignerSetupScreen';
import DashboardScreen from '../screens/DashboardScreen';
import GardenHealthScreen from '../screens/GardenHealthScreen';

const Stack = createStackNavigator();

// ─── Detect Stripe post-payment return ───────────────────────────────────────
// Strategy: before opening Stripe we stamp `acrelogic_pending_tier` in
// localStorage. When Stripe redirects back (to ANY URL on this domain — it
// doesn't need a custom success_url configured), we detect that flag here and
// route directly to SuccessScreen, skipping any saved navigation state that
// would otherwise resurrect PricingScreen on top of the success page.
function getInitialRoute() {
    if (Platform.OS !== 'web') return 'Hero';
    try {
        const params = new URLSearchParams(window.location.search);
        // 1. Stripe was configured with a custom success_url containing ?tier=
        if (params.get('tier')) return 'Success';
        // 2. Fallback: we stamped pending_tier before sending the user to Stripe.
        //    This fires when the Stripe Payment Link redirects to the bare domain.
        if (typeof localStorage !== 'undefined') {
            const pending = localStorage.getItem('acrelogic_pending_tier');
            if (pending === 'basic' || pending === 'premium') return 'Success';
        }
        // Legacy paid export redirect
        if (params.get('paid') === '1') return 'FamilyPlanner';
    } catch {}
    return 'Hero';
}

// True if this page load is a Stripe return — used to skip nav state restore.
function isStripeReturn() {
    if (Platform.OS !== 'web') return false;
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('tier')) return true;
        if (typeof localStorage !== 'undefined') {
            const pending = localStorage.getItem('acrelogic_pending_tier');
            if (pending === 'basic' || pending === 'premium') return true;
        }
    } catch {}
    return false;
}

const INITIAL_ROUTE = getInitialRoute();

export default function AppNavigator() {
    const [isReady, setIsReady] = useState(false);
    const [initialState, setInitialState] = useState(undefined);

    useEffect(() => {
        const restoreState = async () => {
            try {
                // Skip restoring saved nav state on Stripe return.
                // If we did restore it, the old PricingScreen stack would render
                // on top of SuccessScreen, pushing the user back to where they came from.
                if (!isStripeReturn()) {
                    const state = await loadNavigationState();
                    if (state) setInitialState(state);
                }
            } finally {
                setIsReady(true);
            }
        };
        restoreState();
    }, []);

    if (!isReady) {
        return (
            <View style={{ flex: 1, backgroundColor: '#14260C', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#E8F5E9" />
            </View>
        );
    }

    return (
        <NavigationContainer
            initialState={initialState}
            onStateChange={saveNavigationState}
        >
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
                <Stack.Screen name="RoleSelector" component={RoleSelectScreen} />
                <Stack.Screen name="FarmPlanList" component={FarmPlanListScreen} />
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
                <Stack.Screen name="BedDesignerSetup" component={BedDesignerSetupScreen} />
                <Stack.Screen name="Dashboard" component={DashboardScreen} />
                <Stack.Screen name="GardenHealth" component={GardenHealthScreen} />
            </Stack.Navigator>
        </NavigationContainer>

    );
}
