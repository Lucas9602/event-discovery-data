import { Pressable, Text } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LocationProvider, useLocation } from "../src/demo/location";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

function Probe() {
  const { origin, radiusMeters, setOrigin, setRadiusMeters } = useLocation();
  return (
    <>
      <Text>{origin ? origin.label : "none"}</Text>
      <Text>{radiusMeters}</Text>
      <Pressable onPress={() => setOrigin({ lat: 48.03, lon: 7.65, label: "Ihringen" })}>
        <Text>set-origin</Text>
      </Pressable>
      <Pressable onPress={() => setRadiusMeters(10000)}>
        <Text>set-radius</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setOrigin({ lat: 50.11, lon: 8.68, label: "Bothtown" });
          setRadiusMeters(12345);
        }}
      >
        <Text>set-both</Text>
      </Pressable>
    </>
  );
}

describe("LocationProvider", () => {
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("defaults to no origin and 25km radius with no persisted value", async () => {
    await render(
      <LocationProvider>
        <Probe />
      </LocationProvider>,
    );
    expect(await screen.findByText("none")).toBeTruthy();
    expect(await screen.findByText("25000")).toBeTruthy();
  });

  it("sets and persists an origin", async () => {
    await render(
      <LocationProvider>
        <Probe />
      </LocationProvider>,
    );
    fireEvent.press(await screen.findByText("set-origin"));
    expect(await screen.findByText("Ihringen")).toBeTruthy();
    const stored = JSON.parse((await AsyncStorage.getItem("demo.location"))!);
    expect(stored.origin).toEqual({ lat: 48.03, lon: 7.65, label: "Ihringen" });
  });

  it("sets and persists a radius", async () => {
    await render(
      <LocationProvider>
        <Probe />
      </LocationProvider>,
    );
    fireEvent.press(await screen.findByText("set-radius"));
    expect(await screen.findByText("10000")).toBeTruthy();
    const stored = JSON.parse((await AsyncStorage.getItem("demo.location"))!);
    expect(stored.radiusMeters).toBe(10000);
  });

  it("persists both origin and radius when both setters are invoked in the same synchronous handler", async () => {
    await render(
      <LocationProvider>
        <Probe />
      </LocationProvider>,
    );
    fireEvent.press(await screen.findByText("set-both"));
    expect(await screen.findByText("Bothtown")).toBeTruthy();
    expect(await screen.findByText("12345")).toBeTruthy();
    const stored = JSON.parse((await AsyncStorage.getItem("demo.location"))!);
    expect(stored.origin).toEqual({ lat: 50.11, lon: 8.68, label: "Bothtown" });
    expect(stored.radiusMeters).toBe(12345);
  });

  it("loads a persisted origin and radius on mount", async () => {
    await AsyncStorage.setItem(
      "demo.location",
      JSON.stringify({ origin: { lat: 1, lon: 2, label: "Testort" }, radiusMeters: 5000 }),
    );
    await render(
      <LocationProvider>
        <Probe />
      </LocationProvider>,
    );
    expect(await screen.findByText("Testort")).toBeTruthy();
    expect(await screen.findByText("5000")).toBeTruthy();
  });
});
