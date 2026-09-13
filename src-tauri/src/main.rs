// Desktop entry point. All the work lives in lib.rs so the same code can also
// be built for mobile targets later.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gitrove_lib::run()
}
