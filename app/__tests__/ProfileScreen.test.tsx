import { fireEvent, render, screen } from "@testing-library/react-native";
import { FavoritesProvider } from "../src/demo/favorites";
import { LocationProvider } from "../src/demo/location";
import { ProfileScreen } from "../src/demo/ProfileScreen";
import { ThemeProvider } from "../src/demo/theme";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

describe("ProfileScreen dark mode toggle", () => {
  it("renders a Dark Mode switch that starts off", async () => {
    await render(
      <ThemeProvider>
        <LocationProvider>
          <FavoritesProvider>
            <ProfileScreen />
          </FavoritesProvider>
        </LocationProvider>
      </ThemeProvider>,
    );
    const toggle = await screen.findByRole("switch");
    expect(toggle.props.value).toBe(false);
  });

  it("flips on press", async () => {
    await render(
      <ThemeProvider>
        <LocationProvider>
          <FavoritesProvider>
            <ProfileScreen />
          </FavoritesProvider>
        </LocationProvider>
      </ThemeProvider>,
    );
    const toggle = await screen.findByRole("switch");
    fireEvent(toggle, "valueChange", true);
    expect((await screen.findByRole("switch")).props.value).toBe(true);
  });
});
