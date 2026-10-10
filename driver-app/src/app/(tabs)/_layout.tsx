import { Tabs } from 'expo-router';

import { Icon } from '../../components/Icon';
import { colors, fonts } from '../../theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.sign,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.line, height: 64, paddingTop: 6, paddingBottom: 8 },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.concrete },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ({ color }) => <Icon name="truck" color={color} /> }} />
      <Tabs.Screen name="jobs" options={{ title: 'My jobs', tabBarIcon: ({ color }) => <Icon name="list" color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Icon name="person" color={color} /> }} />
    </Tabs>
  );
}
