import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Colors, Spacing, Radius } from '../theme';

/**
 * Global ErrorBoundary to catch rendering crashes and prevent
 * the application from resulting in a blank white screen.
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service like Sentry here
        console.error("ErrorBoundary caught an error", error, errorInfo);
        this.setState({ errorInfo });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        if (this.props.onReset) {
            this.props.onReset();
        }
    }

    render() {
        if (this.state.hasError) {
            // Render fallback UI
            return (
                <View style={styles.container}>
                    <View style={styles.card}>
                        <Text style={styles.title}>Something went wrong</Text>
                        <Text style={styles.subtitle}>
                            A rendering error occurred in this section of the app.
                        </Text>
                        
                        <ScrollView style={styles.errorBox} contentContainerStyle={styles.errorBoxContent}>
                            <Text style={styles.errorText}>
                                {this.state.error && this.state.error.toString()}
                            </Text>
                            {this.state.errorInfo && (
                                <Text style={styles.stackText}>
                                    {this.state.errorInfo.componentStack}
                                </Text>
                            )}
                        </ScrollView>

                        <TouchableOpacity style={styles.button} onPress={this.handleReset}>
                            <Text style={styles.buttonText}>Try Again</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }

        return this.props.children; 
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.backgroundGrey,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
    },
    card: {
        backgroundColor: Colors.white,
        padding: Spacing.xl,
        borderRadius: Radius.lg,
        width: '100%',
        maxWidth: 600,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    title: {
        fontSize: 22,
        fontWeight: 'bold',
        color: Colors.darkText,
        marginBottom: Spacing.sm,
    },
    subtitle: {
        fontSize: 16,
        color: Colors.mutedText,
        marginBottom: Spacing.lg,
    },
    errorBox: {
        backgroundColor: '#FBE9E7',
        borderRadius: Radius.md,
        maxHeight: 250,
        marginBottom: Spacing.xl,
    },
    errorBoxContent: {
        padding: Spacing.md,
    },
    errorText: {
        fontSize: 14,
        color: '#D84315',
        fontWeight: 'bold',
        marginBottom: Spacing.sm,
    },
    stackText: {
        fontSize: 12,
        color: '#D84315',
        fontFamily: 'monospace',
    },
    button: {
        backgroundColor: Colors.primaryGreen,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: Radius.md,
        alignItems: 'center',
    },
    buttonText: {
        color: Colors.white,
        fontSize: 16,
        fontWeight: 'bold',
    },
});
