import os
import webview

from ui_registry import get_ui_schema, build_tabs_from_lsactive, sample_lsactive


class Api:
    def __init__(self):
        self._schema = get_ui_schema()

    def get_ui_schema(self):
        return self._schema

    def get_active_classes(self):
        # TODO: replace with real hardware query using the protocol and transport.
        return build_tabs_from_lsactive(sample_lsactive())


def main():
    web_dir = os.path.join(os.path.dirname(__file__), "web")
    index_path = os.path.join(web_dir, "index.html")
    api = Api()
    webview.create_window(
        "DSW Pro Wheel Configurator",
        index_path,
        js_api=api,
        width=1200,
        height=780,
        min_size=(980, 620),
    )
    webview.start()


if __name__ == "__main__":
    main()
