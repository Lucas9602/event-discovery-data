import { Pressable, Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeProvider, useTheme } from "../src/demo/theme";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

function Probe() {
  const { isDark, toggle } = useTheme();
  return (
    <>
      <Text>{isDark ? "dark" : "light"}</Text>
      <Pressable onPress={toggle}>
        <Text>toggle</Text>
      </Pressable>
    </>
  );
}

describe("ThemeProvider", () => {
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("defaults to light mode with no persisted preference", async () => {
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(await screen.findByText("light")).toBeTruthy();
  });

  it("toggles to dark mode and persists the choice", async () => {
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.press(await screen.findByText("toggle"));
    expect(await screen.findByText("dark")).toBeTruthy();
    expect(await AsyncStorage.getItem("demo.darkMode")).toBe("dark");
  });

  it("loads a persisted dark preference on mount", async () => {
    await AsyncStorage.setItem("demo.darkMode", "dark");
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(await screen.findByText("dark")).toBeTruthy();
  });
});
